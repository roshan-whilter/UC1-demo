import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";
import { badRequest } from "../utils/errors.js";

/**
 * POST /recharge/send_link  (UC2 Branch A)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 * | amount    | number     | optional | omit for a generic link
 *
 * A wrong TYPE for `amount` is a 400 (malformed request). A well-formed number
 * that isn't a usable top-up — zero, negative, over the ceiling — is a 422,
 * raised in the service, because that is a business rule rather than a
 * malformed payload.
 */
export function validateRechargeLinkRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");

  let amount;
  if (body.amount !== undefined && body.amount !== null) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
      throw badRequest("amount must be a number");
    }
    amount = body.amount;
  }

  return { requestId, timestamp, msisdn, amount };
}
