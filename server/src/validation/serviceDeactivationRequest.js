import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /service/send_deactivation_link  (UC4 Branch 2)
 */
export function validateServiceDeactivationRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");
  const serviceId = requireString(body, "serviceId");

  return { requestId, timestamp, msisdn, serviceId };
}
