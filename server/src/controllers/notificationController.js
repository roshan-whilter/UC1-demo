import { sendNotification } from "../services/notificationService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateNotificationRequest } from "../validation/notificationRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /notification/send  (UC3 Branch B)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 *
 * An unexpected throw degrades to "Unable to send notification" rather than a
 * generic internal error, matching every other action endpoint's fail-soft rule.
 */
export async function notificationSend(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateNotificationRequest(req.body);
    const payload = await sendNotification(request);

    logger.info(
      `notification_send SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} notificationId=${payload.notification.notificationId} plan=${request.planId}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to send notification");
    if (!err.code) logger.error("notification_send unexpected error", err);
    logger.warn(
      `notification_send FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
