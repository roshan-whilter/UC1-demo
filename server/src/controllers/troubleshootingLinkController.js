import { sendTroubleshootingLink } from "../services/troubleshootingLinkService.js";
import { validateTroubleshootingLinkRequest } from "../validation/troubleshootingLinkRequest.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export async function troubleshootingLinkSend(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;
  try {
    const request = validateTroubleshootingLinkRequest(req.body);
    const payload = await sendTroubleshootingLink(request);
    logger.info(`troubleshooting_link SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} issue=${request.issueType}`);
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to send troubleshooting link");
    if (!err.code) logger.error("troubleshooting_link unexpected error", err);
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
