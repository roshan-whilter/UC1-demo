/**
 * The response envelope, in one place.
 *
 * The spec fixes both the key SET and the key ORDER of every response, so no
 * controller assembles a response literal by hand — they all go through here.
 *
 *   SUCCESS -> status, error:{}, requestId, timestamp, ...payload
 *   FAILURE -> status, error:{code, message}, requestId, timestamp, msisdn
 */

import { formatTimestamp } from "./timestamp.js";

/**
 * requestId/msisdn are echoed back exactly as they arrived. A malformed request
 * may not have supplied them at all — echo null rather than the string
 * "undefined" so the caller can see that nothing was received.
 */
const echo = (value) => (typeof value === "string" ? value : null);

/**
 * @param {string} requestId echoed from the request
 * @param {object} payload endpoint-specific keys, in the order the spec lists them
 */
export function success(requestId, payload = {}) {
  return {
    status: "SUCCESS",
    error: {},
    requestId: echo(requestId),
    timestamp: formatTimestamp(),
    ...payload,
  };
}

/**
 * @param {string} requestId echoed from the request
 * @param {string} msisdn echoed from the request
 * @param {import("./errors.js").AppError} appError
 */
export function failure(requestId, msisdn, appError) {
  return {
    status: "FAILURE",
    error: { code: appError.code, message: appError.message },
    requestId: echo(requestId),
    timestamp: formatTimestamp(),
    msisdn: echo(msisdn),
  };
}
