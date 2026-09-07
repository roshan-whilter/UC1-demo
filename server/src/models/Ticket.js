import mongoose from "mongoose";
import { TIMESTAMP_PATTERN } from "../utils/timestamp.js";

const ticketSchema = new mongoose.Schema(
  {
    // TKT-<yyyyMMdd>-<4-digit daily sequence>
    ticketId: { type: String, required: true, unique: true, index: true },
    status: { type: String, required: true, enum: ["OPEN"], default: "OPEN" },
    // The spec's createdAt is a yyyyMMddHHmmss string, not a Date.
    createdAt: { type: String, required: true, match: TIMESTAMP_PATTERN },

    msisdn: { type: String, required: true, index: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    summary: { type: String, required: true },
    callbackNumber: { type: String, required: true },
    requestId: { type: String, required: true },

    // Real Date kept alongside the string form purely so the demo console can
    // sort "most recent first" without parsing yyyyMMddHHmmss.
    receivedAt: { type: Date, required: true, default: Date.now },
  },
  { collection: "tickets", timestamps: false }
);

export const Ticket = mongoose.model("Ticket", ticketSchema);
