import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

export function validateIncidentStatusRequest(body) {
  requireObjectBody(body);
  return {
    requestId: requireString(body, "requestId"),
    timestamp: requireTimestamp(body),
    msisdn: requireMsisdn(body),
  };
}
