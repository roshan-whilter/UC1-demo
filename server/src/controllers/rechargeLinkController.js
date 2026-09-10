import { sendRechargeLink } from "../services/rechargeLinkService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateRechargeLinkRequest } from "../validation/rechargeLinkRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /recharge/send_link  (UC2 Branch A)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 *
 * An unexpected throw degrades to "Unable to send recharge link" rather than a
 * generic internal error: on this endpoint the agent must never tell a caller
 * an SMS is on its way when it isn't.
 */
export async function rechargeSendLink(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateRechargeLinkRequest(req.body);
    const payload = await sendRechargeLink(request);

    logger.info(
      `recharge_send_link SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} ref=${payload.link.reference} amount=${payload.link.amount ?? "none"} resend=${payload.message.resendCount}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to send recharge link");
    if (!err.code) logger.error("recharge_send_link unexpected error", err);
    logger.warn(
      `recharge_send_link FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
