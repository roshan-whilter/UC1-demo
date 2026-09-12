import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/**
 * A Smart App push notification (UC3 Branch B).
 *
 * The project's FIRST non-SMS channel. Modeled the same way as every other
 * "send" endpoint — nothing is really pushed, the send is recorded and a
 * push-shaped response returned, so it's safe to run repeatedly.
 */
const notificationSchema = new mongoose.Schema(
  {
    // PUSH-<yyyyMMdd>-<4-digit daily sequence> — its own series, own counter.
    notificationId: { type: String, required: true, unique: true, index: true },

    msisdn: { type: String, required: true, index: true },
    channel: { type: String, required: true, enum: ["PUSH"], default: "PUSH" },
    status: { type: String, required: true, enum: ["SENT", "QUEUED"], default: "SENT" },

    planId: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },

    sentAt: { type: String, required: true, match: TIMESTAMP_PATTERN },

    requestId: { type: String, required: true },
    day: { type: String, required: true, match: DATE_PATTERN, index: true },
  },
  { collection: "notifications", timestamps: false }
);

export const Notification = mongoose.model("Notification", notificationSchema);
