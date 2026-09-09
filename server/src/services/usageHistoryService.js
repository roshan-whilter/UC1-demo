import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { notFound, internal, windowOutOfRange } from "../utils/errors.js";
import { formatDate } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceUsageErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

const MS_PER_DAY = 86400000;

/** yyyyMMdd string -> Date (UTC midnight). Returns null for a bad value. */
function parseDate(value) {
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) return null;
  const y = Number(value.slice(0, 4));
  const m = Number(value.slice(4, 6));
  const d = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The window actually used. `toDate` defaults to today, `fromDate` to 30 days
 * before it. The diagram fixes the window at "last 1 month".
 *
 * @throws AppError 422 when fromDate is after toDate, or the window reaches
 *   back more than 60 days (the demo data only covers the last month).
 */
function resolveWindow(fromDate, toDate) {
  const to = toDate ?? formatDate(new Date());
  const toParsed = parseDate(to);

  const from =
    fromDate ??
    formatDate(new Date(toParsed.getTime() - 30 * MS_PER_DAY));
  const fromParsed = parseDate(from);

  if (fromParsed > toParsed) {
    throw windowOutOfRange("fromDate is after toDate");
  }
  if ((toParsed - fromParsed) / MS_PER_DAY > 60) {
    throw windowOutOfRange("window is longer than the available 1 month of data");
  }

  return { fromDate: from, toDate: to };
}

/**
 * Builds the SUCCESS payload for POST /account/usage_history, in the spec's key
 * order: subscriber, window, cause, internetUsage, vasDeductions.
 *
 * A subscriber with no seeded `usageHistory` (e.g. one added through the demo
 * endpoint) answers "cause not identified" — a valid SUCCESS that routes the
 * agent to escalation, because the mock has no CDR to explain their complaint.
 *
 * @throws AppError 404 unknown number · 422 bad window · 500 forced demo failure
 */
export async function getUsageHistory(msisdn, { fromDate, toDate } = {}) {
  if (isForcedError(msisdn)) {
    throw internal();
  }

  // Window is validated before the lookup so a malformed window is a 422
  // regardless of whether the number exists — the request itself is unusable.
  const window = resolveWindow(fromDate, toDate);

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const usage = subscriber.usageHistory ?? noCause();

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    window,
    cause: {
      identified: usage.cause.identified,
      type: usage.cause.type,
      summary: usage.cause.summary,
    },
    internetUsage: {
      totalUsedMB: usage.internetUsage.totalUsedMB,
      records: (usage.internetUsage.records ?? []).map(internetRecord),
    },
    vasDeductions: {
      totalAmount: usage.vasDeductions.totalAmount,
      currency: usage.vasDeductions.currency,
      records: (usage.vasDeductions.records ?? []).map(vasRecord),
    },
  };
}

/** The escalation payload for a subscriber with no seeded CDR. */
function noCause() {
  return {
    cause: {
      identified: false,
      type: "NONE",
      summary:
        "No usage session or VAS charge in the last month accounts for the reported deduction.",
    },
    internetUsage: { totalUsedMB: 0, records: [] },
    vasDeductions: { totalAmount: 0, currency: "USD", records: [] },
  };
}

const internetRecord = (r) => ({
  startedAt: r.startedAt,
  endedAt: r.endedAt,
  usedMB: r.usedMB,
  network: r.network,
  category: r.category,
});

const vasRecord = (r) => ({
  chargedAt: r.chargedAt,
  service: r.service,
  amount: r.amount,
  currency: r.currency,
  chargeType: r.chargeType,
  status: r.status,
});
