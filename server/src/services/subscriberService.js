import { config } from "../config/env.js";
import { Subscriber } from "../models/Subscriber.js";
import { notFound, internal } from "../utils/errors.js";
import { formatDate } from "../utils/timestamp.js";

/** Lookup key: digits only, so "+855 10 234 567" finds "85510234567". */
const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceBalanceErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Resolves a number to a subscriber.
 *
 * Exact digits first. Failing that, the last 10 digits are tried, because the
 * same mobile arrives in different shapes depending on who typed it and which
 * telephony leg delivered it — "+919899047146", "919899047146" and
 * "9899047146" are one person. The suffix match is only accepted when exactly
 * one record matches, so two stored numbers sharing a tail can never resolve
 * to the wrong account.
 */
async function findSubscriber(msisdn) {
  const digits = lookupKey(msisdn);

  const exact = await Subscriber.findOne({ msisdn: digits }).lean();
  if (exact) return exact;

  if (digits.length < 10) return null;

  const suffix = digits.slice(-10);
  const candidates = await Subscriber.find({
    msisdn: { $regex: `${suffix}$` },
  })
    .limit(2)
    .lean();

  return candidates.length === 1 ? candidates[0] : null;
}

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

  const subscriber = await findSubscriber(msisdn);

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

/** Raised for a bad body; the route turns this into a 400. */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
}

/** yyyyMMdd, `days` from today — for the default expiry dates. */
const expiryIn = (days) => formatDate(new Date(Date.now() + days * 86400000));

function positiveNumber(value, fallback, field) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new ValidationError(`${field} must be a non-negative number`);
  }
  return parsed;
}

function yyyymmdd(value, fallback, field) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string" || !/^\d{8}$/.test(value)) {
    throw new ValidationError(`${field} must be 8 digits, yyyyMMdd`);
  }
  return value;
}

/**
 * Adds a demo subscriber, replacing any record already stored under the same
 * number.
 *
 * Only msisdn and name are required — everything else falls back to a sensible
 * default, so a usable record can be added with a two-field body. Not part of
 * the UC1 spec: this exists so testers can add their own numbers to a running
 * instance without waiting for a redeploy.
 *
 * @throws ValidationError for a bad body
 */
export async function addSubscriber(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("body must be a JSON object");
  }

  // Stored digits-only, so "+91 98990 47146" and "919899047146" are one key.
  const msisdn = lookupKey(String(body.msisdn ?? ""));
  if (msisdn.length < 6) {
    throw new ValidationError(
      "msisdn is required and must contain at least 6 digits"
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    throw new ValidationError("name is required");
  }

  const type = body.type ?? "PREPAID";
  if (type !== "PREPAID" && type !== "POSTPAID") {
    throw new ValidationError("type must be PREPAID or POSTPAID");
  }

  const allowanceMB = positiveNumber(
    body.data?.allowanceMB,
    10240,
    "data.allowanceMB"
  );
  const usedMB = positiveNumber(body.data?.usedMB, 0, "data.usedMB");
  if (usedMB > allowanceMB) {
    throw new ValidationError("data.usedMB cannot exceed data.allowanceMB");
  }

  const bonus = body.balance?.bonus;

  const record = {
    msisdn,
    name,
    type,
    balance: {
      main: {
        amount: positiveNumber(
          body.balance?.main?.amount,
          5,
          "balance.main.amount"
        ),
        currency: body.balance?.main?.currency ?? "USD",
        expiry: yyyymmdd(
          body.balance?.main?.expiry,
          expiryIn(30),
          "balance.main.expiry"
        ),
      },
      // The spec allows a null bonus wallet, so an omitted bonus means none.
      bonus: bonus
        ? {
            amount: positiveNumber(bonus.amount, 0, "balance.bonus.amount"),
            currency: bonus.currency ?? "USD",
            expiry: yyyymmdd(
              bonus.expiry,
              expiryIn(14),
              "balance.bonus.expiry"
            ),
          }
        : null,
    },
    data: {
      allowanceMB,
      usedMB,
      // Derived unless given, so what the agent reads out can never contradict
      // allowance and used.
      remainingMB: positiveNumber(
        body.data?.remainingMB,
        allowanceMB - usedMB,
        "data.remainingMB"
      ),
      expiry: yyyymmdd(body.data?.expiry, expiryIn(30), "data.expiry"),
    },
  };

  const existed = (await Subscriber.countDocuments({ msisdn })) > 0;
  const saved = await Subscriber.findOneAndUpdate(
    { msisdn },
    { $set: record },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  const { _id, __v, createdAt, updatedAt, ...subscriber } = saved;
  return { created: !existed, subscriber };
}
