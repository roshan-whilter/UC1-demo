/**
 * Request validation. Every rejection is a `400 malformed request` in the
 * spec's vocabulary, so every helper here throws AppError("400", ...).
 */

import { badRequest } from "../utils/errors.js";
import { TIMESTAMP_PATTERN } from "../utils/timestamp.js";

export function requireObjectBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw badRequest("body must be a JSON object");
  }
}

export function requireString(body, field) {
  const value = body[field];
  if (value === undefined || value === null) {
    throw badRequest(`${field} is required`);
  }
  if (typeof value !== "string") {
    throw badRequest(`${field} must be a string`);
  }
  if (value.trim() === "") {
    throw badRequest(`${field} must not be empty`);
  }
  return value;
}

/** `timestamp` — string(14), yyyyMMddHHmmss. */
export function requireTimestamp(body, field = "timestamp") {
  const value = requireString(body, field);
  if (!TIMESTAMP_PATTERN.test(value)) {
    throw badRequest(`${field} must be 14 digits in yyyyMMddHHmmss format`);
  }
  return value;
}

/**
 * msisdn is "the caller's number" — the spec puts no pattern on it, so this
 * stays deliberately forgiving: anything carrying at least 6 digits passes,
 * which catches junk without rejecting formats a real CLI might deliver
 * (+855…, spaces, dashes).
 */
export function requireMsisdn(body, field = "msisdn") {
  const value = requireString(body, field);
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6) {
    throw badRequest(`${field} must contain at least 6 digits`);
  }
  return value;
}

export function requireEnum(body, field, allowed) {
  const value = requireString(body, field);
  if (!allowed.includes(value)) {
    throw badRequest(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

export function requireMaxLength(value, field, max) {
  if (value.length > max) {
    throw badRequest(`${field} must be at most ${max} characters`);
  }
  return value;
}
