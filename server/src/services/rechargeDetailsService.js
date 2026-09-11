import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import {
  notFound,
  internal,
  invalidAmount,
  claimOutOfRange,
} from "../utils/errors.js";
import { formatDate } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceRechargeDetailsErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

const MS_PER_DAY = 86400000;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** yyyyMMdd -> "10 September" (no year — the window is only a month wide). */
function spokenDay(yyyymmdd) {
  const day = Number(yyyymmdd.slice(6, 8));
  return `${day} ${MONTHS[Number(yyyymmdd.slice(4, 6)) - 1]}`;
}

/** yyyyMMddHHmmss -> "14:22" */
const spokenTime = (ts) => `${ts.slice(8, 10)}:${ts.slice(10, 12)}`;

const money = (amount, currency) => `${amount.toFixed(2)} ${currency}`;

/** yyyyMMdd -> ms at UTC midnight. */
const dayMs = (d) =>
  Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8));

/**
 * The history window actually searched: the last `rechargeHistoryDays` up to
 * today.
 *
 * @throws AppError 422 when the caller's claimed date can't be checked
 */
function resolveWindow(claimDate) {
  const today = formatDate(new Date());
  const fromDate = formatDate(
    new Date(dayMs(today) - config.rechargeHistoryDays * MS_PER_DAY)
  );

  if (claimDate !== undefined) {
    if (dayMs(claimDate) > dayMs(today)) {
      throw claimOutOfRange("the date given is in the future");
    }
    if (dayMs(claimDate) < dayMs(fromDate)) {
      throw claimOutOfRange(
        `only the last ${config.rechargeHistoryDays} days of top-ups can be checked`
      );
    }
  }

  return { fromDate, toDate: today };
}

/**
 * Finds the recharge that matches the caller's claim.
 *
 * The claim is matched on same day and/or same amount — whichever the caller
 * supplied. Where several records match, a CREDITED one wins over a failed or
 * pending one: if the money did arrive, that is the honest answer to give.
 * Otherwise the most recent match is used.
 */
function findClaimed(records, { date, amount }) {
  if (date === undefined && amount === undefined) return null;

  const candidates = records.filter(
    (r) =>
      (date === undefined || r.rechargedAt.slice(0, 8) === date) &&
      (amount === undefined || r.amount === amount)
  );
  if (candidates.length === 0) return null;

  return (
    candidates.find((r) => r.status === "CREDITED") ??
    candidates.slice().sort((a, b) => b.rechargedAt.localeCompare(a.rechargedAt))[0]
  );
}

/** The sentence the agent reads out, per outcome. */
function summarise(matched, claim, hasAnyRecords, windowDays) {
  if (!matched) {
    if (claim.date === null && claim.amount === null) {
      return "No date or amount was given, so no specific top-up could be checked.";
    }
    if (!hasAnyRecords) {
      return `No top-ups were found on this account in the last ${windowDays} days.`;
    }
    const parts = [];
    if (claim.amount !== null) parts.push(`of ${money(claim.amount, claim.currency)}`);
    if (claim.date !== null) parts.push(`on ${spokenDay(claim.date)}`);
    return `No top-up ${parts.join(" ")} was found in the last ${windowDays} days.`;
  }

  const when = `${spokenDay(matched.rechargedAt.slice(0, 8))} at ${spokenTime(matched.rechargedAt)}`;
  const sum = money(matched.amount, matched.currency);

  switch (matched.status) {
    case "CREDITED":
      return `A ${sum} top-up on ${when} was credited successfully — it should appear after refreshing the app.`;
    case "FAILED":
      return `A ${sum} top-up was attempted on ${when} but the payment failed, so nothing was credited.`;
    case "PENDING":
      return `A ${sum} top-up from ${when} is still processing and has not reached the balance yet.`;
    case "REVERSED":
      return `A ${sum} top-up on ${when} was credited and then reversed.`;
    default:
      return `A ${sum} top-up on ${when} is in an unexpected state (${matched.status}).`;
  }
}

/**
 * Builds the SUCCESS payload for POST /recharge/details, in the spec's key
 * order: subscriber, claim, match, recharges.
 *
 * `match.confirmed` answers the diagram's "Is Recharge Available as per the
 * date and amount provided by customer?" decision. It is true ONLY for a
 * matching, successfully credited top-up — the agent must never tell a caller
 * their money is there when it isn't.
 *
 * @throws AppError 404 unknown number · 422 unusable claim · 500 forced demo failure
 */
export async function getRechargeDetails({ msisdn, date, amount }) {
  if (isForcedError(msisdn)) {
    throw internal();
  }

  // A non-positive claimed amount can't be checked — same 422 family as the
  // out-of-range date, since both are unusable claims rather than bad payloads.
  if (amount !== undefined && amount <= 0) {
    throw invalidAmount("the amount given must be greater than zero");
  }

  // Window before lookup: an uncheckable claim is uncheckable whether or not
  // the number exists.
  const window = resolveWindow(date);

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  // Newest first, as the spec documents.
  const records = (subscriber.rechargeHistory ?? [])
    .slice()
    .sort((a, b) => b.rechargedAt.localeCompare(a.rechargedAt));

  const claim = {
    date: date ?? null,
    amount: amount ?? null,
    currency: "USD",
  };

  const matched = findClaimed(records, { date, amount });

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    claim,
    match: {
      // Confirmed only when the money actually arrived.
      confirmed: matched?.status === "CREDITED",
      status: matched ? matched.status : "NOT_FOUND",
      rechargeId: matched ? matched.rechargeId : null,
      summary: summarise(
        matched,
        claim,
        records.length > 0,
        config.rechargeHistoryDays
      ),
    },
    recharges: {
      window,
      // Only credited top-ups count toward the total the caller actually got.
      totalAmount: Number(
        records
          .filter((r) => r.status === "CREDITED")
          .reduce((n, r) => n + r.amount, 0)
          .toFixed(2)
      ),
      currency: "USD",
      records: records.map(record),
    },
  };
}

const record = (r) => ({
  rechargeId: r.rechargeId,
  rechargedAt: r.rechargedAt,
  amount: r.amount,
  currency: r.currency,
  channel: r.channel,
  status: r.status,
  creditedAt: r.creditedAt ?? null,
  reference: r.reference,
});
