import mongoose from "mongoose";

/**
 * Per-day sequence behind ticketIds. One document per day (`_id` is
 * "ticket:<yyyyMMdd>"), incremented atomically so two concurrent calls can
 * never be handed the same number.
 */
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: "counters", versionKey: false }
);

export const Counter = mongoose.model("Counter", counterSchema);

export async function nextSequence(key) {
  const doc = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return doc.seq;
}
