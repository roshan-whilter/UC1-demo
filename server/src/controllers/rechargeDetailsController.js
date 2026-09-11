import { getRechargeDetails } from "../services/rechargeDetailsService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateRechargeDetailsRequest } from "../validation/rechargeDetailsRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /recharge/details  (UC2 Branch B)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function rechargeDetails(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateRechargeDetailsRequest(req.body);
    const payload = await getRechargeDetails(request);

    logger.info(
      `recharge_details SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} confirmed=${payload.match.confirmed} status=${payload.match.status}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err);
    if (!err.code) logger.error("recharge_details unexpected error", err);
    logger.warn(
      `recharge_details FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
