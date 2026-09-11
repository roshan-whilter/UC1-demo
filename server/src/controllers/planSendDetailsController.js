import { sendPlanDetails } from "../services/planMessageService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validatePlanSendDetailsRequest } from "../validation/planSendDetailsRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /plan/send_details  (UC3 Branch A)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 *
 * An unexpected throw degrades to "Unable to send plan details" rather than a
 * generic internal error: as on the recharge link, the agent must never tell a
 * caller an SMS is on its way when it isn't.
 */
export async function planSendDetails(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validatePlanSendDetailsRequest(req.body);
    const payload = await sendPlanDetails(request);

    logger.info(
      `plan_send_details SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} messageId=${payload.message.messageId} plan=${payload.content.planId} scope=${payload.content.scope} resend=${payload.message.resendCount}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to send plan details");
    if (!err.code) logger.error("plan_send_details unexpected error", err);
    logger.warn(
      `plan_send_details FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
