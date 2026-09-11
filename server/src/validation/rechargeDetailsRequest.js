import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";
import { badRequest } from "../utils/errors.js";
import { DATE_PATTERN } from "../utils/timestamp.js";

/**
 * POST /recharge/details  (UC2 Branch B)
 *
 * | requestId | string     | required |
 * | timestamp | string(14) | required |
 * | msisdn    | string     | required |
 * | date      | string(8)  | optional | yyyyMMdd — the day the CALLER says they topped up
 * | amount    | number     | optional | the amount the CALLER says they topped up
 *
 * `date` and `amount` are the caller's CLAIM, not filters. Both are optional:
 * a caller who can't remember either still gets their recent recharges back.
 *
 * A wrong TYPE is a 400. A well-formed claim that can't be checked — a future
 * date, one older than the available history, a non-positive amount — is a 422,
 * raised in the service, because that is a business rule not a malformed body.
 */
export function validateRechargeDetailsRequest(body) {
  requireObjectBody(body);

  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body, "timestamp");
  const msisdn = requireMsisdn(body, "msisdn");

  let date;
  if (body.date !== undefined && body.date !== null) {
    if (typeof body.date !== "string" || !DATE_PATTERN.test(body.date)) {
      throw badRequest("date must be 8 digits in yyyyMMdd format");
    }
    date = body.date;
  }

  let amount;
  if (body.amount !== undefined && body.amount !== null) {
    if (typeof body.amount !== "number" || !Number.isFinite(body.amount)) {
      throw badRequest("amount must be a number");
    }
    amount = body.amount;
  }

  return { requestId, timestamp, msisdn, date, amount };
}
