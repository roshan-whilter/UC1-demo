import { getPlanDetails } from "../services/planDetailsService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validatePlanDetailsRequest } from "../validation/planDetailsRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /account/plan_details  (Branch C)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function planDetails(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validatePlanDetailsRequest(req.body);
    const payload = await getPlanDetails(request.msisdn);

    logger.info(
      `plan_details SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} plan=${payload.plan?.planId ?? "none"} services=${payload.services.length}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err);
    if (!err.code) logger.error("plan_details unexpected error", err);
    logger.warn(
      `plan_details FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
