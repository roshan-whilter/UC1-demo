/**
 * The spec's endpoints answer HTTP 200 for both application outcomes, so
 * nothing here treats a non-2xx as the failure signal — `status` in the body is
 * the signal. The one exception is 401, which is a transport-level rejection.
 */

import { loadApiKey } from "./apiKey.js";

const authHeaders = () => ({
  "Content-Type": "application/json",
  "x-api-key": loadApiKey(),
});

async function postJson(path, body) {
  const started = performance.now();
  const res = await fetch(path, {
    method: "POST",
    headers: authHeaders(),
    body,
  });

  const text = await res.text();
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }

  return {
    httpStatus: res.status,
    body: parsed,
    raw: text,
    durationMs: Math.round(performance.now() - started),
  };
}

export const callBalanceUsage = (rawBody) =>
  postJson("/account/balance_usage", rawBody);

export const callUsageHistory = (rawBody) =>
  postJson("/account/usage_history", rawBody);

export const callPlanDetails = (rawBody) =>
  postJson("/account/plan_details", rawBody);

export const callRechargeLink = (rawBody) =>
  postJson("/recharge/send_link", rawBody);

export const callTicketCreate = (rawBody) => postJson("/ticket/create", rawBody);

/** Thrown for a 401 so the UI can tell "bad key" from "server is down". */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

async function getJson(path) {
  const res = await fetch(path, { headers: { "x-api-key": loadApiKey() } });
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export const fetchTickets = async () => (await getJson("/demo/tickets?limit=20")).tickets;

export const fetchSubscribers = () => getJson("/demo/subscribers");

export const fetchRechargeLinks = async () =>
  (await getJson("/demo/recharge_links?limit=20")).rechargeLinks;
