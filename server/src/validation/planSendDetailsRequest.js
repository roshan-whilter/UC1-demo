import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";
import { badRequest } from "../utils/errors.js";

/**
 * POST /plan/send_details  (UC3 Branch A)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 * | planId    | string     | optional | omit for the current active plan
 *
 * A wrong TYPE for `planId` is a 400 (malformed request). A well-formed plan id
 * that isn't this subscriber's is a 422, raised in the service, because that is
 * a business rule rather than a malformed payload — the same split UC2 Branch A
 * uses for `amount`.
 */
export function validatePlanSendDetailsRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");

  let planId;
  if (body.planId !== undefined && body.planId !== null) {
    if (typeof body.planId !== "string") {
      throw badRequest("planId must be a string");
    }
    if (body.planId.trim() === "") {
      throw badRequest("planId must not be empty");
    }
    planId = body.planId;
  }

  return { requestId, timestamp, msisdn, planId };
}
