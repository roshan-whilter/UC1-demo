import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/** `balance.main` / `balance.bonus` — amount, currency, expiry (yyyyMMdd). */
const balanceBucketSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "USD" },
    expiry: { type: String, required: true, match: DATE_PATTERN },
  },
  { _id: false }
);

const dataBundleSchema = new mongoose.Schema(
  {
    allowanceMB: { type: Number, required: true },
    usedMB: { type: Number, required: true },
    remainingMB: { type: Number, required: true },
    expiry: { type: String, required: true, match: DATE_PATTERN },
  },
  { _id: false }
);

// --- Branch B: usage history + CDR --------------------------------------
// One internet session from the CDR.
const internetRecordSchema = new mongoose.Schema(
  {
    startedAt: { type: String, required: true },
    endedAt: { type: String, required: true },
    usedMB: { type: Number, required: true },
    network: { type: String, required: true },
    category: { type: String, required: true },
  },
  { _id: false }
);

// One VAS charge from the CDR.
const vasRecordSchema = new mongoose.Schema(
  {
    chargedAt: { type: String, required: true },
    service: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "USD" },
    chargeType: { type: String, required: true },
    status: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Backs POST /account/usage_history. Optional on a subscriber: seeded demo
 * numbers carry it; a subscriber added through the demo endpoint does not, and
 * the service then answers "cause not identified" (the escalation path).
 */
const usageHistorySchema = new mongoose.Schema(
  {
    cause: {
      identified: { type: Boolean, required: true },
      type: { type: String, required: true },
      summary: { type: String, required: true },
    },
    internetUsage: {
      totalUsedMB: { type: Number, required: true, default: 0 },
      records: { type: [internetRecordSchema], default: [] },
    },
    vasDeductions: {
      totalAmount: { type: Number, required: true, default: 0 },
      currency: { type: String, required: true, default: "USD" },
      records: { type: [vasRecordSchema], default: [] },
    },
  },
  { _id: false }
);

// --- Branch C: plan & service details -----------------------------------
/** `plan.price` / `services[].price` — amount, currency, billing cycle. */
const priceSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "USD" },
    cycle: { type: String, required: true, default: "MONTHLY" },
  },
  { _id: false }
);

/**
 * The active plan. Optional on a subscriber — the spec allows `plan: null` for
 * a pay-as-you-go subscriber, or one whose pack has expired.
 */
const planSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: priceSchema, required: true },
    activatedOn: { type: String, required: true, match: DATE_PATTERN },
    renewsOn: { type: String, required: true, match: DATE_PATTERN },
    inclusions: {
      dataMB: { type: Number, required: true },
      onNetMinutes: { type: Number, required: true },
      offNetMinutes: { type: Number, required: true },
      smsCount: { type: Number, required: true },
    },
  },
  { _id: false }
);

/** One currently-active VAS subscription. */
const serviceSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: priceSchema, required: true },
    activatedOn: { type: String, required: true, match: DATE_PATTERN },
    renewsOn: { type: String, required: true, match: DATE_PATTERN },
  },
  { _id: false }
);

// --- UC3 Branch A: plan history ----------------------------------------
/**
 * A plan the subscriber used to be on. Same shape as `planSchema` except it
 * carries `endedOn` rather than `renewsOn` — a plan that has ended does not
 * renew, and reusing `renewsOn` here would read fine in JSON while lying to the
 * caller.
 *
 * `inclusions` is kept in full so the agent can answer the question this branch
 * exists for: "my old plan had more data, didn't it?"
 */
const previousPlanSchema = new mongoose.Schema(
  {
    planId: { type: String, required: true },
    name: { type: String, required: true },
    price: { type: priceSchema, required: true },
    activatedOn: { type: String, required: true, match: DATE_PATTERN },
    endedOn: { type: String, required: true, match: DATE_PATTERN },
    inclusions: {
      dataMB: { type: Number, required: true },
      onNetMinutes: { type: Number, required: true },
      offNetMinutes: { type: Number, required: true },
      smsCount: { type: Number, required: true },
    },
  },
  { _id: false }
);

// --- UC2 Branch B: recharge history ------------------------------------
/**
 * One past top-up. Embedded on the subscriber (like `usageHistory`) because it
 * is static demo data seeded per number — unlike `RechargeLink`, which has its
 * own collection because those rows are created at runtime.
 */
const rechargeRecordSchema = new mongoose.Schema(
  {
    rechargeId: { type: String, required: true },
    rechargedAt: { type: String, required: true, match: TIMESTAMP_PATTERN },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, default: "USD" },
    channel: { type: String, required: true },
    status: { type: String, required: true },
    // Only set when status is CREDITED — null otherwise.
    creditedAt: { type: String, default: null },
    reference: { type: String, required: true },
  },
  { _id: false }
);

const subscriberSchema = new mongoose.Schema(
  {
    msisdn: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    type: { type: String, required: true, enum: ["PREPAID", "POSTPAID"] },
    balance: {
      main: { type: balanceBucketSchema, required: true },
      // The spec allows `bonus` to be null (subscriber has no bonus wallet).
      bonus: { type: balanceBucketSchema, default: null },
    },
    data: { type: dataBundleSchema, required: true },
    // Branch B only. Absent for subscribers added through the demo endpoint.
    usageHistory: { type: usageHistorySchema, default: null },
    // Branch C. `plan` may legitimately be null (nothing active); `services`
    // defaults to an empty list.
    plan: { type: planSchema, default: null },
    services: { type: [serviceSchema], default: [] },
    // UC3 Branch A. Empty for a subscriber who has never changed plan — a
    // SUCCESS, not an error. Stored newest-ended first; the response caps it.
    previousPlans: { type: [previousPlanSchema], default: [] },
    // UC2 Branch B. Empty for a subscriber with no top-ups on file.
    rechargeHistory: { type: [rechargeRecordSchema], default: [] },
  },
  { collection: "subscribers", timestamps: true }
);

export const Subscriber = mongoose.model("Subscriber", subscriberSchema);
