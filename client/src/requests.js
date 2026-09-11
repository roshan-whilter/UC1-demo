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

export const usageHistoryRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-usg-${shortId()}`,
      timestamp: nowTimestamp(),
      msisdn,
    },
    null,
    2
  );

export const planDetailsRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-pln-${shortId()}`,
      timestamp: nowTimestamp(),
      msisdn,
    },
    null,
    2
  );

export const rechargeLinkRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-rcg-${shortId()}`,
      timestamp: nowTimestamp(),
      msisdn,
      amount: 5.0,
    },
    null,
    2
  );

export const rechargeDetailsRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-rcd-${shortId()}`,
      timestamp: nowTimestamp(),
      msisdn,
      date: nowTimestamp().slice(0, 8),
      amount: 5.0,
    },
    null,
    2
  );

/**
 * UC3 Branch A. `planId` is omitted deliberately — the common case is "text me
 * my plan", and omitting it means the current one. Add a planId by hand to text
 * a previous plan instead.
 */
export const planSendDetailsRequest = (msisdn = "85510234567") =>
  JSON.stringify(
    {
      requestId: `req-psm-${shortId()}`,
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
  { msisdn: "85510234567", label: "Healthy account", hint: "SUCCESS — the spec's example payload; UC3 full 2-plan history" },
  { msisdn: "85510555111", label: "POSTPAID", hint: "SUCCESS — bonus is null; UC3 one previous plan" },
  { msisdn: "85510777222", label: "Empty account", hint: "SUCCESS — zero balance, data exhausted; Branch B no-cause; no plan, so UC3 send_details is a 422" },
  { msisdn: "9654987095", label: "Guneet Gandhiok", hint: "SUCCESS — added for live-call testing; UC3 no plan history" },
  { msisdn: "9870566624", label: "Raghav Kumaria", hint: "SUCCESS — has a bonus wallet; UC3 full 2-plan history" },
  { msisdn: "919899047146", label: "Ravinder Malhotra", hint: "SUCCESS — POSTPAID; UC3 one previous plan" },
  { msisdn: "85510000000", label: "Unknown number", hint: "FAILURE 404 — Subscriber not found" },
  { msisdn: "85510999500", label: "Broken backend", hint: "FAILURE 500 — internal error; UC3 'SMS gateway unavailable'" },
];
