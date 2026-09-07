import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /account/balance_usage
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 */
export function validateBalanceUsageRequest(body) {
  requireObjectBody(body);
  return {
    requestId: requireString(body, "requestId"),
    timestamp: requireTimestamp(body, "timestamp"),
    msisdn: requireMsisdn(body, "msisdn"),
  };
}
