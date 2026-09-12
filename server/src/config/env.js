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

  // UC3 Branch A: msisdns that force the plan/send_details 500 branch (SMS
  // gateway down) — the branch's designated fallback, where the agent reads the
  // plan aloud instead of promising a text.
  forcePlanSmsErrorMsisdns: list(
    process.env.FORCE_PLAN_SMS_ERROR_MSISDNS ?? "85510999500"
  ),
  // UC3 Branch A — how many previous plans `plan_details` returns. The diagram
  // says "Last 2 Plans", so 2 is the diagram's number, not ours; whether the
  // real platform can return more is an open item.
  maxPreviousPlans: Number(process.env.MAX_PREVIOUS_PLANS || 2),
  // UC2 Branch A: msisdns that force the send_link 500 branch (gateway down).
  forceRechargeErrorMsisdns: list(
    process.env.FORCE_RECHARGE_ERROR_MSISDNS ?? "85510999500"
  ),

  // UC2 Branch B: msisdns that force the recharge_details 500 branch.
  forceRechargeDetailsErrorMsisdns: list(
    process.env.FORCE_RECHARGE_DETAILS_ERROR_MSISDNS ?? "85510999500"
  ),
  // UC2 Branch B — how far back recharge history is searched. Axiata's real
  // retention is an open item; 30 days matches UC1 Branch B's window.
  rechargeHistoryDays: Number(process.env.RECHARGE_HISTORY_DAYS || 30),

  // UC2 Branch A — recharge deep-link. The real link format is an open item;
  // this is a plausible placeholder, swappable without a code change.
  rechargeLinkBaseUrl:
    process.env.RECHARGE_LINK_BASE_URL || "https://smart.com.kh/recharge",
  // How long a sent link stays valid.
  rechargeLinkTtlHours: Number(process.env.RECHARGE_LINK_TTL_HOURS || 24),
  // Top-up ceiling for the 422. Axiata's real limit is still to be confirmed.
  maxTopUpAmount: Number(process.env.MAX_TOPUP_AMOUNT || 100),

  // UC3 Branch B: msisdns that force the plan/recommendations 500 branch.
  forcePlanRecommendationsErrorMsisdns: list(
    process.env.FORCE_PLAN_RECOMMENDATIONS_ERROR_MSISDNS ?? "85510999500"
  ),
  // UC3 Branch B: msisdns that force the plan/send_change_link 500 branch
  // (gateway down) — same fail-soft rule as every other SMS endpoint.
  forcePlanChangeLinkErrorMsisdns: list(
    process.env.FORCE_PLAN_CHANGE_LINK_ERROR_MSISDNS ?? "85510999500"
  ),
  // UC3 Branch B — plan-change deep-link. The real link format is an open
  // item, same as UC2-A's recharge link; this is a plausible placeholder.
  planChangeLinkBaseUrl:
    process.env.PLAN_CHANGE_LINK_BASE_URL || "https://smart.com.kh/plan-change",
  // How long a sent plan-change link stays valid.
  planChangeLinkTtlHours: Number(process.env.PLAN_CHANGE_LINK_TTL_HOURS || 24),
  // UC3 Branch B: msisdns that force the notification/send 500 branch (push
  // service down) — the project's first non-SMS channel, same fail-soft rule.
  forceNotificationErrorMsisdns: list(
    process.env.FORCE_NOTIFICATION_ERROR_MSISDNS ?? "85510999500"
  ),
};
