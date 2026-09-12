import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /plan/send_change_link  (UC3 Branch B)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 * | planId    | string     | required | which plan to switch to
 *
 * Unlike `/plan/send_details`, `planId` is REQUIRED here — there is no
 * sensible default plan to switch to. A wrong TYPE or missing value is a 400;
 * a well-formed but unrecognised planId is a 422, raised in the service,
 * because that is a business rule rather than a malformed payload.
 */
export function validatePlanChangeLinkRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");
  const planId = requireString(body, "planId");

  return { requestId, timestamp, msisdn, planId };
}
