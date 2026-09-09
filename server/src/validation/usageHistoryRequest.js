import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";
import { badRequest } from "../utils/errors.js";
import { DATE_PATTERN } from "../utils/timestamp.js";

/** Optional yyyyMMdd date — a malformed value is a 400. */
function optionalDate(body, field) {
  const value = body[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) {
    throw badRequest(`${field} must be 8 digits in yyyyMMdd format`);
  }
  return value;
}

/**
 * POST /account/usage_history
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 * | fromDate  | string(8)  | optional | yyyyMMdd
 * | toDate    | string(8)  | optional | yyyyMMdd
 *
 * The fromDate > toDate check is a 422 (window out of range), handled in the
 * service — not a 400 — so it is deliberately not enforced here.
 */
export function validateUsageHistoryRequest(body) {
  requireObjectBody(body);
  return {
    requestId: requireString(body, "requestId"),
    timestamp: requireTimestamp(body, "timestamp"),
    msisdn: requireMsisdn(body, "msisdn"),
    fromDate: optionalDate(body, "fromDate"),
    toDate: optionalDate(body, "toDate"),
  };
}
