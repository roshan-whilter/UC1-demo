import { sendPlanChangeLink } from "../services/planChangeLinkService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validatePlanChangeLinkRequest } from "../validation/planChangeLinkRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /plan/send_change_link  (UC3 Branch B)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 *
 * An unexpected throw degrades to "Unable to send plan change link" rather
 * than a generic internal error: the agent must never tell a caller a link is
 * on its way when it isn't.
 */
export async function planSendChangeLink(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validatePlanChangeLinkRequest(req.body);
    const payload = await sendPlanChangeLink(request);

    logger.info(
      `plan_send_change_link SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} messageId=${payload.message.messageId} plan=${payload.change.planId} resend=${payload.message.resendCount}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to send plan change link");
    if (!err.code) logger.error("plan_send_change_link unexpected error", err);
    logger.warn(
      `plan_send_change_link FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
