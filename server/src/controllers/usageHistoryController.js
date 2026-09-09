import { getUsageHistory } from "../services/usageHistoryService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateUsageHistoryRequest } from "../validation/usageHistoryRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /account/usage_history  (Branch B)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function usageHistory(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateUsageHistoryRequest(req.body);
    const payload = await getUsageHistory(request.msisdn, {
      fromDate: request.fromDate,
      toDate: request.toDate,
    });

    logger.info(
      `usage_history SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} cause=${payload.cause.identified}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err);
    if (!err.code) logger.error("usage_history unexpected error", err);
    logger.warn(
      `usage_history FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
