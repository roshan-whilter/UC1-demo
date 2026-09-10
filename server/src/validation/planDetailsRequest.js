import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /account/plan_details  (Branch C)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 *
 * No date window — this is a "current state" lookup, the same shape as
 * Branch A's balance request.
 */
export function validatePlanDetailsRequest(body) {
  requireObjectBody(body);
  return {
    requestId: requireString(body, "requestId"),
    timestamp: requireTimestamp(body, "timestamp"),
    msisdn: requireMsisdn(body, "msisdn"),
  };
}
