import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { findCatalogPlan } from "../data/planCatalog.js";
import { PlanChangeLink } from "../models/PlanChangeLink.js";
import { nextSequence } from "../models/Counter.js";
import { notFound, internal, unknownPlan, AppError } from "../utils/errors.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forcePlanChangeLinkErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /plan/send_change_link, in the spec's
 * key order: subscriber, message, change.
 *
 * The project's THIRD action endpoint. As with the other two, nothing is
 * actually sent — the send is recorded and a gateway-shaped response returned.
 *
 * Unlike `/plan/send_details`, `planId` is REQUIRED: there is no sensible
 * default plan to switch to, so the agent must have already settled on one
 * (from `/plan/recommendations`'s `plans[]`) before calling this.
 *
 * @throws AppError 404 unknown number · 422 unknown plan ·
 *   500 forced "gateway down" demo failure, or a persistence failure
 */
export async function sendPlanChangeLink({ requestId, msisdn, planId }) {
  // Forced failure first, so the gateway-down demo doesn't fall through to a 404.
  if (isForcedError(msisdn)) {
    throw internal("Plan change service unavailable");
  }

  const plan = findCatalogPlan(planId);
  if (!plan) {
    throw unknownPlan(`${planId} is not a plan we offer`);
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const now = new Date();
  const day = formatDate(now);
  const sentAt = formatTimestamp(now);
  const expiresAt = formatTimestamp(
    new Date(now.getTime() + config.planChangeLinkTtlHours * 3600000)
  );

  // How many change-links this subscriber has already had TODAY — counted
  // before the new row exists, so the first send of the day reports 0.
  const resendCount = await PlanChangeLink.countDocuments({
    msisdn: subscriber.msisdn,
    day,
  });

  let saved;
  try {
    // One sequence per send drives both ids, so SMS-PCH-…-0001 and
    // PCH-…-0001 always refer to the same send.
    const seq = String(await nextSequence(`plan_change:${day}`)).padStart(4, "0");
    const reference = `PCH-${day}-${seq}`;

    saved = await PlanChangeLink.create({
      reference,
      messageId: `SMS-PCH-${day}-${seq}`,
      msisdn: subscriber.msisdn,
      to: subscriber.msisdn,
      channel: "SMS",
      status: "SENT",
      planId: plan.planId,
      planName: plan.name,
      url: `${config.planChangeLinkBaseUrl}?ref=${reference}&plan=${plan.planId}`,
      sentAt,
      expiresAt,
      requestId,
      day,
    });
  } catch (err) {
    // A failed write means we cannot promise the caller anything was sent.
    throw new AppError("500", "Unable to send plan change link");
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
    change: {
      planId: saved.planId,
      planName: saved.planName,
      link: {
        reference: saved.reference,
        url: saved.url,
        expiresAt: saved.expiresAt,
      },
    },
  };
}

export async function listPlanChangeLinks(limit = 20) {
  return PlanChangeLink.find({}, { _id: 0, __v: 0 })
    .sort({ sentAt: -1, reference: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
