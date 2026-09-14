import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/** A troubleshooting deep-link sent by SMS (UC5 Branch 2). */
const troubleshootingLinkSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    messageId: { type: String, required: true, unique: true },
    msisdn: { type: String, required: true, index: true },
    to: { type: String, required: true },
    channel: { type: String, required: true, enum: ["SMS"], default: "SMS" },
    status: { type: String, required: true, enum: ["SENT", "QUEUED"], default: "SENT" },
    issueType: { type: String, required: true },
    stepsReference: { type: String, required: true },
    url: { type: String, required: true },
    sentAt: { type: String, required: true, match: TIMESTAMP_PATTERN },
    expiresAt: { type: String, required: true, match: TIMESTAMP_PATTERN },
    requestId: { type: String, required: true },
    day: { type: String, required: true, match: DATE_PATTERN, index: true },
  },
  { collection: "troubleshootingLinks", timestamps: false }
);

export const TroubleshootingLink = mongoose.model(
  "TroubleshootingLink",
  troubleshootingLinkSchema
);
