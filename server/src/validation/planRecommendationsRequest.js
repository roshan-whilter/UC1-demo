import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /plan/recommendations  (UC3 Branch B)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 *
 * Same shape as `/account/plan_details` — a pure lookup, no other inputs.
 */
export function validatePlanRecommendationsRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");

  return { requestId, timestamp, msisdn };
}
