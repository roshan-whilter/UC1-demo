import { config } from "../config/env.js";
import { Subscriber } from "../models/Subscriber.js";
import { notFound, internal } from "../utils/errors.js";

/** Lookup key: digits only, so "+855 10 234 567" finds "85510234567". */
const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceBalanceErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /account/balance_usage — the three keys
 * that sit after the envelope, in the order the spec lists them.
 *
 * `subscriber.msisdn` is the stored canonical number, not the raw request value.
 *
 * @throws AppError 404 when the number is unknown, 500 for a forced demo failure
 */
export async function getBalanceAndUsage(msisdn) {
  // Forced failures are checked first so a demo number can show the 500 branch
  // rather than falling through to a 404.
  if (isForcedError(msisdn)) {
    throw internal();
  }

  const subscriber = await Subscriber.findOne({
    msisdn: lookupKey(msisdn),
  }).lean();

  if (!subscriber) {
    throw notFound();
  }

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    balance: {
      main: bucket(subscriber.balance?.main),
      bonus: bucket(subscriber.balance?.bonus),
    },
    data: {
      allowanceMB: subscriber.data.allowanceMB,
      usedMB: subscriber.data.usedMB,
      remainingMB: subscriber.data.remainingMB,
      expiry: subscriber.data.expiry,
    },
  };
}

/** amount, currency, expiry — or null, which the spec permits for `bonus`. */
function bucket(value) {
  if (!value) return null;
  return {
    amount: value.amount,
    currency: value.currency,
    expiry: value.expiry,
  };
}

export async function listSubscribers() {
  return Subscriber.find({}, { _id: 0, __v: 0 }).sort({ msisdn: 1 }).lean();
}
