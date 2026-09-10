import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/**
 * A recharge deep-link sent to a subscriber by SMS (UC2 Branch A).
 *
 * Unlike every UC1 endpoint, `POST /recharge/send_link` is an ACTION — it has a
 * real-world side effect. Persisting each send is what makes `resendCount`
 * possible and gives the demo console something to show.
 */
const rechargeLinkSchema = new mongoose.Schema(
  {
    // RCG-<yyyyMMdd>-<4-digit daily sequence>
    reference: { type: String, required: true, unique: true, index: true },
    // SMS-<yyyyMMdd>-<4-digit daily sequence> — same sequence number
    messageId: { type: String, required: true, unique: true },

    msisdn: { type: String, required: true, index: true },
    // The number the SMS went to (canonical form).
    to: { type: String, required: true },
    channel: { type: String, required: true, enum: ["SMS"], default: "SMS" },
    status: { type: String, required: true, enum: ["SENT", "QUEUED"], default: "SENT" },

    // null for a generic link (the caller did not name an amount).
    amount: { type: Number, default: null },
    currency: { type: String, required: true, default: "USD" },
    url: { type: String, required: true },

    sentAt: { type: String, required: true, match: TIMESTAMP_PATTERN },
    expiresAt: { type: String, required: true, match: TIMESTAMP_PATTERN },

    requestId: { type: String, required: true },
    // yyyyMMdd of the send — indexed so the per-day resendCount is a cheap count.
    day: { type: String, required: true, match: DATE_PATTERN, index: true },
  },
  { collection: "rechargeLinks", timestamps: false }
);

export const RechargeLink = mongoose.model("RechargeLink", rechargeLinkSchema);
