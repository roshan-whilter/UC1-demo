import { getBalanceAndUsage } from "../services/subscriberService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateBalanceUsageRequest } from "../validation/balanceUsageRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /account/balance_usage
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function balanceUsage(req, res) {
  // Read straight off the raw body: a request that fails validation still has
  // to have its requestId/msisdn echoed in the FAILURE envelope.
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateBalanceUsageRequest(req.body);
    const payload = await getBalanceAndUsage(request.msisdn);

    logger.info(
      `balance_usage SUCCESS requestId=${request.requestId} msisdn=${request.msisdn}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err);
    if (!err.code) logger.error("balance_usage unexpected error", err);
    logger.warn(
      `balance_usage FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res
      .status(200)
      .json(failure(rawRequestId, rawMsisdn, appError));
  }
}
