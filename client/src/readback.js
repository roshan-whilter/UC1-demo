/**
 * Turns a response into the line the voice agent would actually say, following
 * the agent-behaviour notes in the spec:
 *   - SUCCESS      -> read main + bonus balance and data remaining
 *   - 404 / 500    -> apologise and offer the callback ticket
 *   - ticket 500   -> still assure the caller a callback is logged (fail soft)
 *
 * Presentation only — nothing here affects the API contract.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** yyyyMMdd -> "5 October 2026" */
function spokenDate(value) {
  if (!/^\d{8}$/.test(value)) return value;
  const day = Number(value.slice(6, 8));
  const month = MONTHS[Number(value.slice(4, 6)) - 1];
  return `${day} ${month} ${value.slice(0, 4)}`;
}

function spokenAmount({ amount, currency }) {
  const unit = currency === "USD" ? "dollars" : currency;
  return `${amount.toFixed(2)} ${unit}`;
}

function spokenData(mb) {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} gigabytes`;
  return `${mb} megabytes`;
}

export function balanceReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    return "I'm sorry — I can't pull your account details up right now. Let me log a callback so a colleague can look into this and call you back.";
  }

  const { subscriber, balance, data } = body;
  const parts = [`Hello ${subscriber.name}.`];

  parts.push(
    `Your main balance is ${spokenAmount(balance.main)}, valid until ${spokenDate(balance.main.expiry)}.`
  );

  if (balance.bonus) {
    parts.push(
      `You also have a bonus balance of ${spokenAmount(balance.bonus)}, valid until ${spokenDate(balance.bonus.expiry)}.`
    );
  }

  if (data.remainingMB === 0) {
    parts.push(
      `You've used all ${spokenData(data.allowanceMB)} of your data bundle, so there's nothing remaining.`
    );
  } else {
    parts.push(
      `You have ${spokenData(data.remainingMB)} of data remaining out of ${spokenData(data.allowanceMB)}, valid until ${spokenDate(data.expiry)}.`
    );
  }

  parts.push("Is there anything else I can help you with today?");
  return parts.join(" ");
}

export function ticketReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    // Fail soft: the caller is still told a callback is logged.
    return "I've logged a callback request for you. One of our colleagues will call you back on this number.";
  }

  return `Thank you. I've raised this for you — your reference is ${body.ticket.ticketId}. One of our colleagues will call you back on this number.`;
}

/**
 * UC2 Branch A: what the agent says after sending the recharge link.
 *
 * The 500 case is the important one — the gateway is down, so the agent must
 * NOT claim an SMS is on its way. It falls back to voice-only guidance, which
 * the spec makes this branch's designated fallback.
 */
export function rechargeReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    const code = body.error?.code;
    if (code === "422") {
      return "That amount isn't valid for a top-up, sorry. What amount would you like to add?";
    }
    if (code === "404") {
      return "I'm sorry — I can't find an account on this number. Let me put you through to a colleague who can help.";
    }
    // 500 and anything else: no SMS went out, so don't promise one.
    return "I wasn't able to text you the link just now, sorry. Let me walk you through it instead: you can top up in the Smart app, by dialling the USSD code, or with a scratch voucher from any Smart retailer. Would you like me to go through any of those in detail?";
  }

  const { subscriber, link } = body;
  const parts = [`Thanks ${subscriber.name}.`];

  if (link.amount === null) {
    parts.push("I've sent a recharge link to your number by SMS.");
  } else {
    parts.push(
      `I've sent a recharge link for ${spokenAmount({ amount: link.amount, currency: link.currency })} to your number by SMS.`
    );
  }

  parts.push("It's valid for the next 24 hours.");
  parts.push("Does that resolve your question, or is there anything else I can help with?");
  return parts.join(" ");
}

/**
 * Branch C: what the agent says after the plan_details lookup — read back the
 * plan and active services. Detail questions about inclusions/exclusions would
 * be answered from the knowledge base, which is outside this mock.
 */
export function planReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    return "I'm sorry — I can't pull your plan details up right now. Let me put you through to a colleague who can help.";
  }

  const { subscriber, plan, services } = body;
  const parts = [`Hello ${subscriber.name}.`];

  if (!plan) {
    parts.push(
      "You don't have an active plan on this number at the moment — you're on pay-as-you-go."
    );
  } else {
    parts.push(
      `You're on ${plan.name}, at ${spokenAmount(plan.price)} a month, renewing on ${spokenDate(plan.renewsOn)}.`
    );
    parts.push(
      `It includes ${spokenData(plan.inclusions.dataMB)} of data, ${plan.inclusions.onNetMinutes} on-net and ${plan.inclusions.offNetMinutes} off-net minutes, and ${plan.inclusions.smsCount} SMS.`
    );
  }

  if (!services || services.length === 0) {
    parts.push("You have no add-on services active.");
  } else {
    const spoken = services
      .map((s) => `${s.name} at ${spokenAmount(s.price)} a month`)
      .join(", and ");
    parts.push(
      `You also have ${services.length === 1 ? "one active service" : `${services.length} active services`}: ${spoken}.`
    );
  }

  parts.push("Does that resolve your question?");
  return parts.join(" ");
}

/**
 * Branch B: what the agent says after the usage_history lookup, following the
 * flow — explain the cause if found, otherwise escalate to a human.
 */
export function usageReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    return "I'm sorry — I can't pull your usage history up right now. Let me put you through to a colleague who can look into this for you.";
  }

  const { subscriber, cause } = body;

  if (!cause.identified) {
    return `I'm sorry ${subscriber.name}, I've checked your usage for the last month and I can't find anything that explains the deduction you're describing. Let me put you through to a colleague who can look into it further.`;
  }

  return `Thanks ${subscriber.name}. I've looked into it — ${cause.summary} Does that resolve your question, or is there anything else I can help with?`;
}
