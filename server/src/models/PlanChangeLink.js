import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/**
 * A plan-change deep-link sent to a subscriber by SMS (UC3 Branch B).
 *
 * The project's THIRD action endpoint, after the recharge link (UC2-A) and the
 * plan-details SMS (UC3-A). Own collection, same reasoning as those two: these
 * rows are created at runtime, unlike the static per-subscriber demo data.
 */
const planChangeLinkSchema = new mongoose.Schema(
  {
    // PCH-<yyyyMMdd>-<4-digit daily sequence>
    reference: { type: String, required: true, unique: true, index: true },
    // SMS-PCH-<yyyyMMdd>-<same sequence> — a THIRD distinct SMS prefix, so this
    // series can never collide with UC2-A's SMS-… or UC3-A's SMS-PLN-… series.
    messageId: { type: String, required: true, unique: true },

    msisdn: { type: String, required: true, index: true },
    // The number the SMS went to (canonical form, not the raw request string).
    to: { type: String, required: true },
    channel: { type: String, required: true, enum: ["SMS"], default: "SMS" },
    status: { type: String, required: true, enum: ["SENT", "QUEUED"], default: "SENT" },

    planId: { type: String, required: true },
    planName: { type: String, required: true },
    url: { type: String, required: true },

    sentAt: { type: String, required: true, match: TIMESTAMP_PATTERN },
    expiresAt: { type: String, required: true, match: TIMESTAMP_PATTERN },

    requestId: { type: String, required: true },
    // yyyyMMdd of the send — indexed so the per-day resendCount is a cheap count.
    day: { type: String, required: true, match: DATE_PATTERN, index: true },
  },
  { collection: "planChangeLinks", timestamps: false }
);

export const PlanChangeLink = mongoose.model("PlanChangeLink", planChangeLinkSchema);
