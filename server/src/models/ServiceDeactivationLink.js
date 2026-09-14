import mongoose from "mongoose";
import { DATE_PATTERN, TIMESTAMP_PATTERN } from "../utils/timestamp.js";

/**
 * A service deactivation deep-link sent to a subscriber by SMS (UC4 Branch 2).
 * Own collection, same reasoning as the other runtime action endpoints.
 */
const serviceDeactivationLinkSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true, index: true },
    messageId: { type: String, required: true, unique: true },

    msisdn: { type: String, required: true, index: true },
    to: { type: String, required: true },
    channel: { type: String, required: true, enum: ["SMS"], default: "SMS" },
    status: { type: String, required: true, enum: ["SENT", "QUEUED"], default: "SENT" },

    serviceId: { type: String, required: true },
    serviceName: { type: String, required: true },
    ussdCode: { type: String, required: true },
    url: { type: String, required: true },

    sentAt: { type: String, required: true, match: TIMESTAMP_PATTERN },
    expiresAt: { type: String, required: true, match: TIMESTAMP_PATTERN },

    requestId: { type: String, required: true },
    day: { type: String, required: true, match: DATE_PATTERN, index: true },
  },
  { collection: "serviceDeactivationLinks", timestamps: false }
);

export const ServiceDeactivationLink = mongoose.model(
  "ServiceDeactivationLink",
  serviceDeactivationLinkSchema
);
