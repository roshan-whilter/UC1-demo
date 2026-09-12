import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";

/**
 * POST /notification/send  (UC3 Branch B)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 * | planId    | string     | required | which plan the notification is about
 *
 * Same required-planId shape as `/plan/send_change_link` — a push notification
 * with nothing to say isn't a useful mock.
 */
export function validateNotificationRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");
  const planId = requireString(body, "planId");

  return { requestId, timestamp, msisdn, planId };
}
