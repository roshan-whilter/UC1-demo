/** Request builders — timestamps are generated fresh so requests look live. */

const pad = (value, width = 2) => String(value).padStart(width, "0");

export function nowTimestamp(date = new Date()) {
  return (
    date.getFullYear() +
    pad(date.getMonth() + 1) +
    pad(date.getDate()) +
    pad(date.getHours()) +
    pad(date.getMinutes()) +
    pad(date.getSeconds())
  );
}

const shortId = () => Math.random().toString(36).slice(2, 8);

export const balanceUsageRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-bal-${shortId()}`,
      timestamp: nowTimestamp(),
      msisdn,
    },
    null,
    2
  );

export const ticketCreateRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-tkt-${shortId()}`,
      timestamp: nowTimestamp(),
      msisdn,
      type: "COMPLAINT",
      category: "BALANCE_USAGE",
      summary: "Customer says 2 GB of data disappeared overnight without use.",
      callbackNumber: msisdn,
    },
    null,
    2
  );

/**
 * The numbers seeded (or configured) to drive each branch of the demo flow.
 * `hint` is what the caller should expect to happen.
 */
export const DEMO_NUMBERS = [
  { msisdn: "85510234567", label: "Healthy account", hint: "SUCCESS — the spec's example payload" },
  { msisdn: "85510555111", label: "POSTPAID", hint: "SUCCESS — bonus is null" },
  { msisdn: "85510777222", label: "Empty account", hint: "SUCCESS — zero balance, data exhausted" },
  { msisdn: "85510000000", label: "Unknown number", hint: "FAILURE 404 — Subscriber not found" },
  { msisdn: "85510999500", label: "Broken backend", hint: "FAILURE 500 — internal error" },
];
