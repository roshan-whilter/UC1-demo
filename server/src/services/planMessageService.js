import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { visiblePreviousPlans } from "./planDetailsService.js";
import { PlanMessage } from "../models/PlanMessage.js";
import { nextSequence } from "../models/Counter.js";
import { notFound, internal, unknownPlan, AppError } from "../utils/errors.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forcePlanSmsErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /plan/send_details, in the spec's key
 * order: subscriber, message, content.
 *
 * The project's second ACTION endpoint. As with UC2 Branch A, nothing is
 * actually sent: no SMS gateway is called, the send is recorded and a
 * gateway-shaped response returned, so the demo is safe to run repeatedly
 * against real numbers.
 *
 * @throws AppError 404 unknown number · 422 unknown plan, or no plan to send ·
 *   500 forced "gateway down" demo failure, or a persistence failure
 */
export async function sendPlanDetails({ requestId, msisdn, planId }) {
  // Forced failure first, so the gateway-down demo doesn't fall through to a 404.
  if (isForcedError(msisdn)) {
    throw internal("SMS gateway unavailable");
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const { plan, scope } = selectPlan(subscriber, planId);
  const services = subscriber.services ?? [];
  // Add-ons are a property of what is active now, so they only go out with a
  // CURRENT plan — we hold no historical add-on data.
  const includesAddOns = scope === "CURRENT" && services.length > 0;

  const now = new Date();
  const day = formatDate(now);
  const sentAt = formatTimestamp(now);

  // How many plan SMSs this subscriber has already had TODAY — counted before
  // the new row exists, so the first send of the day reports 0.
  const resendCount = await PlanMessage.countDocuments({
    msisdn: subscriber.msisdn,
    day,
  });

  let saved;
  try {
    const seq = String(await nextSequence(`plan_sms:${day}`)).padStart(4, "0");

    saved = await PlanMessage.create({
      messageId: `SMS-PLN-${day}-${seq}`,
      msisdn: subscriber.msisdn,
      to: subscriber.msisdn,
      channel: "SMS",
      status: "SENT",
      planId: plan.planId,
      planName: plan.name,
      scope,
      includesAddOns,
      summary: buildSummary(plan, scope, includesAddOns ? services : []),
      sentAt,
      requestId,
      day,
    });
  } catch (err) {
    // A failed write means we cannot promise the caller anything was sent.
    throw new AppError("500", "Unable to send plan details");
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
    content: {
      planId: saved.planId,
      planName: saved.planName,
      scope: saved.scope,
      includesAddOns: saved.includesAddOns,
      summary: saved.summary,
    },
  };
}

/**
 * Which plan to text.
 *
 * Omitting `planId` means the current active plan — the common case, "text me
 * my plan". Naming one lets the caller ask for an old plan they were just told
 * about, so the SMS matches what was discussed.
 *
 * Only plans `plan_details` actually exposes are selectable: the current one
 * plus the previous ones inside the cap. An agent can therefore never text a
 * plan the caller was never read out.
 *
 * @throws AppError 422 when the subscriber holds no plan, or names one that
 *   isn't theirs
 */
function selectPlan(subscriber, planId) {
  const current = subscriber.plan ?? null;
  const previous = visiblePreviousPlans(subscriber);

  if (planId === undefined) {
    if (!current) {
      throw unknownPlan("subscriber has no active plan to send");
    }
    return { plan: current, scope: "CURRENT" };
  }

  // Current wins over history: a subscriber who left a plan and later returned
  // to it is on it now, and "now" is the honest answer.
  if (current && current.planId === planId) {
    return { plan: current, scope: "CURRENT" };
  }

  const match = previous.find((entry) => entry.planId === planId);
  if (match) {
    return { plan: match, scope: "PREVIOUS" };
  }

  throw unknownPlan(`${planId} is not a current or previous plan for this subscriber`);
}

// --- the text itself ----------------------------------------------------

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** yyyyMMdd -> "30 Sep 2026" — short, because this is an SMS. */
function shortDate(value) {
  if (!/^\d{8}$/.test(value)) return value;
  return `${Number(value.slice(6, 8))} ${MONTHS[Number(value.slice(4, 6)) - 1]} ${value.slice(0, 4)}`;
}

const money = ({ amount, currency }) => `${amount.toFixed(2)} ${currency}`;

/** MONTHLY -> "monthly". Unknown cycles degrade to lowercase rather than throw. */
const cycleWord = (cycle) => String(cycle ?? "").toLowerCase();

/** MONTHLY -> "/mo" — the compact form used in the add-on list. */
function cycleSuffix(cycle) {
  const map = { MONTHLY: "/mo", WEEKLY: "/wk", DAILY: "/day", YEARLY: "/yr" };
  return map[cycle] ?? `/${cycleWord(cycle)}`;
}

/** 10240 -> "10 GB", 1536 -> "1.5 GB", 512 -> "512 MB". */
function dataAmount(mb) {
  if (mb < 1024) return `${mb} MB`;
  const gb = mb / 1024;
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
}

/**
 * The text of the message. Kept to one paragraph: an SMS that spills past a
 * segment arrives split, which is why add-ons are the only optional part.
 *
 * A previous plan reads "ended", not "renews" — it does not renew — and
 * "Included", not "Includes".
 */
function buildSummary(plan, scope, services) {
  const isCurrent = scope === "CURRENT";
  const when = isCurrent
    ? `renews ${shortDate(plan.renewsOn)}`
    : `ended ${shortDate(plan.endedOn)}`;

  const { dataMB, onNetMinutes, offNetMinutes, smsCount } = plan.inclusions;

  const parts = [
    `${plan.name} — ${money(plan.price)} ${cycleWord(plan.price.cycle)}, ${when}.`,
    `${isCurrent ? "Includes" : "Included"} ${dataAmount(dataMB)} data, ${onNetMinutes} on-net and ${offNetMinutes} off-net minutes, ${smsCount} SMS.`,
  ];

  if (services.length > 0) {
    const list = services
      .map((s) => `${s.name} ${money(s.price)}${cycleSuffix(s.price.cycle)}`)
      .join(", ");
    parts.push(`Add-ons: ${list}.`);
  }

  return parts.join(" ");
}

export async function listPlanMessages(limit = 20) {
  return PlanMessage.find({}, { _id: 0, __v: 0 })
    .sort({ sentAt: -1, messageId: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
