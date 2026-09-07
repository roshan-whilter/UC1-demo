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
  },
  { collection: "subscribers", timestamps: true }
);

export const Subscriber = mongoose.model("Subscriber", subscriberSchema);
