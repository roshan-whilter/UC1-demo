import { getPlanRecommendations } from "../services/planRecommendationsService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validatePlanRecommendationsRequest } from "../validation/planRecommendationsRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /plan/recommendations  (UC3 Branch B)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function planRecommendations(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validatePlanRecommendationsRequest(req.body);
    const payload = await getPlanRecommendations(request.msisdn);

    logger.info(
      `plan_recommendations SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} plans=${payload.plans.length}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err);
    if (!err.code) logger.error("plan_recommendations unexpected error", err);
    logger.warn(
      `plan_recommendations FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
