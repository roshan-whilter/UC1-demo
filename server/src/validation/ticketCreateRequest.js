import { config } from "../config/env.js";
import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
  requireEnum,
  requireMaxLength,
} from "./validators.js";

/**
 * `type` is an enum. Branches A and B log a `COMPLAINT`; Branch C logs an
 * `ENQUIRY`, because a resolved plan question would misrepresent itself in CSM
 * as a complaint. Add further members here if the real ticketing system
 * exposes them.
 */
export const TICKET_TYPES = ["COMPLAINT", "ENQUIRY"];

/**
 * POST /ticket/create
 *
 * | requestId      | string     | required |
 * | timestamp      | string(14) | required |
 * | msisdn         | string     | required |
 * | type           | enum       | required | COMPLAINT (A, B) · ENQUIRY (C)
 * | category       | string     | required | free text; differs per branch
 * | summary        | string     | required | agent-written
 * | callbackNumber | string     | required | defaults to msisdn
 */
export function validateTicketCreateRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");
  const type = requireEnum(body, "type", TICKET_TYPES);
  const category = requireString(body, "category");
  const summary = requireMaxLength(
    requireString(body, "summary"),
    "summary",
    config.maxSummaryLength
  );

  // The spec marks callbackNumber required but also says it "defaults to
  // msisdn" — so an omitted value is filled in rather than rejected. A value
  // that IS supplied still has to be a usable number.
  const callbackNumber =
    body.callbackNumber === undefined || body.callbackNumber === null
      ? msisdn
      : requireMsisdn(body, "callbackNumber");

  return {
    requestId,
    timestamp,
    msisdn,
    type,
    category,
    summary,
    callbackNumber,
  };
}
