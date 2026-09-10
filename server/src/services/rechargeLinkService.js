import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { RechargeLink } from "../models/RechargeLink.js";
import { nextSequence } from "../models/Counter.js";
import {
  notFound,
  internal,
  invalidAmount,
  AppError,
} from "../utils/errors.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceRechargeErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /recharge/send_link, in the spec's key
 * order: subscriber, message, link.
 *
 * This is the project's first ACTION endpoint — every UC1 endpoint was a read.
 * Nothing is actually sent: no SMS gateway is called. The send is recorded and
 * a gateway-shaped response returned, so the demo is safe to run repeatedly
 * against real numbers.
 *
 * @throws AppError 404 unknown number · 422 unusable amount · 500 forced
 *   "gateway down" demo failure, or a persistence failure
 */
export async function sendRechargeLink({ requestId, msisdn, amount }) {
  // Forced failure first, so the gateway-down demo doesn't fall through to a 404.
  if (isForcedError(msisdn)) {
    throw internal("SMS gateway unavailable");
  }

  // Amount is checked before the lookup: an unusable amount is unusable
  // whether or not the number exists, and re-asking is cheaper than a lookup.
  if (amount !== undefined) {
    if (amount <= 0) {
      throw invalidAmount("must be greater than zero");
    }
    if (amount > config.maxTopUpAmount) {
      throw invalidAmount(
        `must not exceed ${config.maxTopUpAmount.toFixed(2)} USD`
      );
    }
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const now = new Date();
  const day = formatDate(now);
  const sentAt = formatTimestamp(now);
  const expiresAt = formatTimestamp(
    new Date(now.getTime() + config.rechargeLinkTtlHours * 3600000)
  );

  // How many links this subscriber has already had TODAY — counted before the
  // new row exists, so the first send of the day reports 0.
  const resendCount = await RechargeLink.countDocuments({
    msisdn: subscriber.msisdn,
    day,
  });

  let saved;
  try {
    // One sequence per send drives both ids, so SMS-…-0001 and RCG-…-0001
    // always refer to the same send.
    const seq = String(await nextSequence(`recharge:${day}`)).padStart(4, "0");
    const reference = `RCG-${day}-${seq}`;
    const messageId = `SMS-${day}-${seq}`;

    saved = await RechargeLink.create({
      reference,
      messageId,
      msisdn: subscriber.msisdn,
      to: subscriber.msisdn,
      channel: "SMS",
      status: "SENT",
      amount: amount === undefined ? null : amount,
      currency: "USD",
      url: buildUrl(reference, amount),
      sentAt,
      expiresAt,
      requestId,
      day,
    });
  } catch (err) {
    // A failed write means we cannot promise the caller anything was sent.
    throw new AppError("500", "Unable to send recharge link");
  }

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    message: {
      messageId: saved.messageId,
      channel: saved.channel,
      to: saved.to,
      status: saved.status,
      sentAt: saved.sentAt,
      resendCount,
    },
    link: {
      reference: saved.reference,
      url: saved.url,
      amount: saved.amount,
      currency: saved.currency,
      expiresAt: saved.expiresAt,
    },
  };
}

/** The deep-link. `amount` is appended only when the caller named one. */
function buildUrl(reference, amount) {
  const base = `${config.rechargeLinkBaseUrl}?ref=${reference}`;
  return amount === undefined ? base : `${base}&amount=${amount.toFixed(2)}`;
}

export async function listRechargeLinks(limit = 20) {
  return RechargeLink.find({}, { _id: 0, __v: 0 })
    .sort({ sentAt: -1, reference: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
