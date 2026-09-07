/**
 * The spec uses two string date formats and no others:
 *   timestamp / createdAt -> yyyyMMddHHmmss  (14 chars)
 *   expiry                -> yyyyMMdd        (8 chars)
 *
 * Both are rendered in the server's local timezone (set TZ in .env to pin it).
 */

const pad = (value, width = 2) => String(value).padStart(width, "0");

export const TIMESTAMP_PATTERN = /^\d{14}$/;
export const DATE_PATTERN = /^\d{8}$/;

/** yyyyMMddHHmmss */
export function formatTimestamp(date = new Date()) {
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

/** yyyyMMdd — used for expiry fields and for the ticketId date segment */
export function formatDate(date = new Date()) {
  return date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
}
