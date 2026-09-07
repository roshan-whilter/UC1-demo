import { createTicket } from "../services/ticketService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateTicketCreateRequest } from "../validation/ticketCreateRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /ticket/create
 *
 * Always HTTP 200. An unexpected throw degrades to the spec's own ticket
 * failure message rather than a generic one.
 */
export async function ticketCreate(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateTicketCreateRequest(req.body);
    const payload = await createTicket(request);

    logger.info(
      `ticket_create SUCCESS requestId=${request.requestId} ticketId=${payload.ticket.ticketId}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to create ticket");
    if (!err.code) logger.error("ticket_create unexpected error", err);
    logger.warn(
      `ticket_create FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res
      .status(200)
      .json(failure(rawRequestId, rawMsisdn, appError));
  }
}
