import { sendServiceDeactivationLink } from "../services/serviceDeactivationLinkService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateServiceDeactivationRequest } from "../validation/serviceDeactivationRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /service/send_deactivation_link  (UC4 Branch 2)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function serviceSendDeactivationLink(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateServiceDeactivationRequest(req.body);
    const payload = await sendServiceDeactivationLink(request);

    logger.info(
      `service_send_deactivation_link SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} service=${payload.deactivation.serviceId} resend=${payload.message.resendCount}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to send deactivation link");
    if (!err.code) logger.error("service_send_deactivation_link unexpected error", err);
    logger.warn(
      `service_send_deactivation_link FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
