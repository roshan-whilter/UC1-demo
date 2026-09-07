/**
 * Mandatory `x-api-key` on every endpoint that reads or writes demo data.
 *
 * Auth is a transport concern, not one of the two documented operations, so an
 * unauthorised call answers with a real HTTP 401 — an unmistakable signal for a
 * teammate holding the wrong key, and not something the voice agent should ever
 * mistake for "the lookup failed, offer a callback".
 *
 * The BODY is still the spec's FAILURE envelope, so a caller that only parses
 * `status` / `error.code` keeps working unchanged.
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { config } from "../config/env.js";
import { failure } from "../utils/envelope.js";
import { unauthorized } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

const HEADER = "x-api-key";

/** Hash both sides so the compare is constant-time even for unequal lengths. */
const digest = (value) => createHash("sha256").update(String(value), "utf8").digest();

const matches = (provided, expected) =>
  timingSafeEqual(digest(provided), digest(expected));

/** First 6 chars only — enough to tell keys apart in a log, useless if leaked. */
const fingerprint = (key) =>
  typeof key === "string" && key.length > 0 ? `${key.slice(0, 6)}…` : "(none)";

/**
 * True when the request carried a configured key. Exported so the JSON-parse
 * error handler can reject unauthenticated callers before reporting anything
 * about their request.
 */
export function isAuthorized(req) {
  const provided = req.get(HEADER);
  if (!provided) return false;
  // No keys configured means nothing can authenticate — fail closed.
  return config.apiKeys.some((expected) => matches(provided, expected));
}

export function requireApiKey(req, res, next) {
  if (isAuthorized(req)) return next();

  const provided = req.get(HEADER);
  logger.warn(
    `401 ${req.method} ${req.path} key=${fingerprint(provided)} ip=${req.ip}`
  );

  const reason = provided
    ? "Invalid API key"
    : `Missing ${HEADER} header`;

  return res
    .status(401)
    .set("WWW-Authenticate", `ApiKey realm="uc1-demo", header="${HEADER}"`)
    .json(failure(req.body?.requestId, req.body?.msisdn, unauthorized(reason)));
}
