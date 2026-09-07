import { config } from "../config/env.js";
import { Ticket } from "../models/Ticket.js";
import { nextSequence } from "../models/Counter.js";
import { AppError } from "../utils/errors.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceTicketErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /ticket/create.
 *
 * Note there is deliberately NO subscriber-existence check: the spec's fallback
 * path is "balance lookup returned 404 -> apologise -> create a ticket anyway",
 * so an unknown msisdn must still get a ticket.
 *
 * @throws AppError 500 for a forced demo failure or a write that fails
 */
export async function createTicket(request) {
  if (isForcedError(request.msisdn)) {
    throw new AppError("500", "Unable to create ticket");
  }

  const now = new Date();
  const day = formatDate(now);
  const createdAt = formatTimestamp(now);

  let ticket;
  try {
    const seq = await nextSequence(`ticket:${day}`);
    const ticketId = `TKT-${day}-${String(seq).padStart(4, "0")}`;

    ticket = await Ticket.create({
      ticketId,
      status: "OPEN",
      createdAt,
      msisdn: request.msisdn,
      type: request.type,
      category: request.category,
      summary: request.summary,
      callbackNumber: request.callbackNumber,
      requestId: request.requestId,
      receivedAt: now,
    });
  } catch (err) {
    // Persistence problems surface as the spec's ticket failure, message and all.
    throw new AppError("500", "Unable to create ticket");
  }

  return {
    ticket: {
      ticketId: ticket.ticketId,
      status: ticket.status,
      createdAt: ticket.createdAt,
    },
  };
}

export async function listTickets(limit = 20) {
  return Ticket.find({}, { _id: 0, __v: 0 })
    .sort({ receivedAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
