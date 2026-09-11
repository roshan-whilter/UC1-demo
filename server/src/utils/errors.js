/**
 * Application-level failures. Per the spec these never become HTTP codes — the
 * code travels in the body as `error.code`, and it is a STRING ("400"/"404"/"500"),
 * not a number.
 */
export class AppError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AppError";
    this.code = code;
  }
}

/** `400 malformed request` — the detail goes in the message, the shape stays {code, message}. */
export const badRequest = (detail) =>
  new AppError("400", `Malformed request: ${detail}`);

/** `404 subscriber not found` — message text fixed by the spec. */
export const notFound = () => new AppError("404", "Subscriber not found");

/** `422 window out of range` — UC1 Branch B usage_history date window. */
export const windowOutOfRange = (detail) =>
  new AppError("422", `Window out of range: ${detail}`);

/** `422 claim out of range` — UC2 Branch B recharge claim date. */
export const claimOutOfRange = (detail) =>
  new AppError("422", `Claim out of range: ${detail}`);

/** `422 invalid amount` — UC2 Branch A recharge amount. */
export const invalidAmount = (detail) =>
  new AppError("422", `Invalid amount: ${detail}`);

/** `500 internal error` */
export const internal = (message = "Internal error") =>
  new AppError("500", message);

/**
 * Not in the UC1 spec's code list — the spec defines no auth. Carried in the
 * same envelope so envelope-parsing callers still understand the body, while
 * the HTTP status is a real 401.
 */
export const unauthorized = (message = "Unauthorized") =>
  new AppError("401", message);

/**
 * Anything that reaches a controller's catch block becomes an AppError. Unexpected
 * throws (driver errors, bugs) are deliberately flattened to a 500 with a fixed
 * message so internals are never leaked to the caller.
 */
export function toAppError(err, fallbackMessage = "Internal error") {
  if (err instanceof AppError) return err;
  return new AppError("500", fallbackMessage);
}
