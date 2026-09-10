import "dotenv/config";

const list = (value) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri:
    process.env.MONGO_URI ||
    "mongodb://root:root@localhost:27017/uc1_demo_mock?authSource=admin",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  logLevel: process.env.LOG_LEVEL || "info",

  // Accepted x-api-key values. Comma-separated so each teammate can hold their
  // own key and be revoked individually. Empty = nothing can authenticate, and
  // server.js refuses to boot rather than serve an unprotected API.
  apiKeys: list(process.env.API_KEYS),

  // Longest summary accepted by /ticket/create. The spec asks for "one or two
  // sentences"; this is only a sanity guard against runaway agent output.
  maxSummaryLength: Number(process.env.MAX_SUMMARY_LENGTH || 2000),

  // Demo levers — msisdns that force the failure branches so both paths can be
  // shown live without editing data. Checked BEFORE the subscriber lookup, so a
  // forced 500 wins over a would-be 404.
  forceBalanceErrorMsisdns: list(
    process.env.FORCE_BALANCE_ERROR_MSISDNS ?? "85510999500"
  ),
  forceTicketErrorMsisdns: list(
    process.env.FORCE_TICKET_ERROR_MSISDNS ?? "85510999500"
  ),
  // Branch B: msisdns that force the usage_history 500 branch.
  forceUsageErrorMsisdns: list(
    process.env.FORCE_USAGE_ERROR_MSISDNS ?? "85510999500"
  ),
  // Branch C: msisdns that force the plan_details 500 branch.
  forcePlanErrorMsisdns: list(
    process.env.FORCE_PLAN_ERROR_MSISDNS ?? "85510999500"
  ),
};
