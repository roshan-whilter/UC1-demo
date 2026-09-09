import mongoose from "mongoose";
import { DATE_PATTERN } from "../utils/timestamp.js";

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
  },
  { collection: "subscribers", timestamps: true }
);

export const Subscriber = mongoose.model("Subscriber", subscriberSchema);
