import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /sim/status  (UC4 Branch 3)
 */
export function validateSimStatusRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");

  return { requestId, timestamp, msisdn };
}
