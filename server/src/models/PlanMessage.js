import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/**
 * A plan-details SMS sent to a subscriber (UC3 Branch A).
 *
 * The project's second ACTION endpoint, after UC2 Branch A's recharge link.
 * Nothing is really texted — persisting each send is what makes `resendCount`
 * possible and gives the demo console a record of what the agent dispatched.
 *
 * Its own collection rather than an embedded field, for the same reason as
 * `RechargeLink`: these rows are created at runtime, unlike the static
 * per-number demo data embedded on the subscriber.
 */
const planMessageSchema = new mongoose.Schema(
  {
    // SMS-PLN-<yyyyMMdd>-<4-digit daily sequence>. The PLN segment keeps this
    // series distinct from UC2 Branch A's SMS-<yyyyMMdd>-<nnnn>, which draws
    // from a separate counter and would otherwise collide.
    messageId: { type: String, required: true, unique: true, index: true },

    msisdn: { type: String, required: true, index: true },
    // The number the SMS went to (canonical form, not the raw request string).
    to: { type: String, required: true },
    channel: { type: String, required: true, enum: ["SMS"], default: "SMS" },
    status: {
      type: String,
      required: true,
      enum: ["SENT", "QUEUED"],
      default: "SENT",
    },

    // What was sent.
    planId: { type: String, required: true },
    planName: { type: String, required: true },
    // Whether an active or an ended plan was texted.
    scope: { type: String, required: true, enum: ["CURRENT", "PREVIOUS"] },
    includesAddOns: { type: Boolean, required: true, default: false },
    summary: { type: String, required: true },

    sentAt: { type: String, required: true, match: TIMESTAMP_PATTERN },

    requestId: { type: String, required: true },
    // yyyyMMdd of the send — indexed so the per-day resendCount is a cheap count.
    day: { type: String, required: true, match: DATE_PATTERN, index: true },
  },
  { collection: "planMessages", timestamps: false }
);

export const PlanMessage = mongoose.model("PlanMessage", planMessageSchema);
