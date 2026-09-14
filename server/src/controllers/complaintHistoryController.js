import { getComplaintHistory } from "../services/complaintHistoryService.js";
import { validateComplaintHistoryRequest } from "../validation/complaintHistoryRequest.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export async function complaintHistory(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;
  try {
    const request = validateComplaintHistoryRequest(req.body);
    const payload = await getComplaintHistory(request);
    logger.info(`complaint_history SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} count=${payload.complaints.length}`);
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to retrieve complaint history");
    if (!err.code) logger.error("complaint_history unexpected error", err);
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
