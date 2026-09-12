import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { findCatalogPlan } from "../data/planCatalog.js";
import { Notification } from "../models/Notification.js";
import { nextSequence } from "../models/Counter.js";
import { notFound, internal, unknownPlan, AppError } from "../utils/errors.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceNotificationErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /notification/send, in the spec's key
 * order: subscriber, notification.
 *
 * The project's FIRST non-SMS channel — a Smart App push. Modeled exactly like
 * the SMS action endpoints: nothing is actually pushed, the send is recorded
 * and a push-shaped response returned.
 *
 * @throws AppError 404 unknown number · 422 unknown plan ·
 *   500 forced "push service down" demo failure, or a persistence failure
 */
export async function sendNotification({ requestId, msisdn, planId }) {
  if (isForcedError(msisdn)) {
    throw internal("Push notification service unavailable");
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

  let saved;
  try {
    const seq = String(await nextSequence(`notification:${day}`)).padStart(4, "0");

    saved = await Notification.create({
      notificationId: `PUSH-${day}-${seq}`,
      msisdn: subscriber.msisdn,
      channel: "PUSH",
      status: "SENT",
      planId: plan.planId,
      title: "Plan change ready",
      body: `Tap to confirm your switch to ${plan.name}.`,
      sentAt,
      requestId,
      day,
    });
  } catch (err) {
    // A failed write means we cannot promise the caller anything was sent.
    throw new AppError("500", "Unable to send notification");
  }

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    notification: {
      notificationId: saved.notificationId,
      channel: saved.channel,
      status: saved.status,
      sentAt: saved.sentAt,
      title: saved.title,
      body: saved.body,
    },
  };
}

export async function listNotifications(limit = 20) {
  return Notification.find({}, { _id: 0, __v: 0 })
    .sort({ sentAt: -1, notificationId: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
