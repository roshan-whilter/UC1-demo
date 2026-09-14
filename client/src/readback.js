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

/** MONTHLY -> "a month", WEEKLY -> "a week". Read from the plan, never assumed. */
function spokenCycle(cycle) {
  const map = { MONTHLY: "a month", WEEKLY: "a week", DAILY: "a day", YEARLY: "a year" };
  return map[cycle] ?? `every ${String(cycle ?? "").toLowerCase()}`;
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
 * UC2 Branch B: what the agent says after checking the recharge claim.
 *
 * Only a CREDITED match lets the agent confirm the money arrived. Every other
 * status escalates — and the wording differs per status, because the human
 * picking up the transfer needs to know which situation they're inheriting.
 */
export function rechargeDetailsReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    const code = body.error?.code;
    if (code === "422") {
      return "I can only check top-ups from the last 30 days, and that date is outside it. Do you remember roughly when it was?";
    }
    return "I'm sorry — I can't check your top-up history right now. Let me put you through to a colleague who can look into it.";
  }

  const { subscriber, match } = body;

  if (match.confirmed) {
    return `Good news ${subscriber.name} — ${match.summary} Could you close and reopen the app to refresh it? Does that resolve your question, or is there anything else I can help with?`;
  }

  const tail =
    "Let me put you through to a colleague who can take this further.";

  switch (match.status) {
    case "FAILED":
      return `I'm sorry ${subscriber.name} — ${match.summary} ${tail} They can check whether you were charged.`;
    case "PENDING":
      return `Thanks ${subscriber.name}. ${match.summary} ${tail} They can look into the delay.`;
    case "REVERSED":
      return `I'm sorry ${subscriber.name} — ${match.summary} ${tail} They can explain why it was reversed.`;
    default:
      return `I'm sorry ${subscriber.name} — ${match.summary} ${tail}`;
  }
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

  // UC3 Branch A: the same endpoint now carries plan history, and the agent
  // reads back the active OR a previous plan depending on what was asked. An
  // empty history is not an error — there is simply nothing earlier on file.
  const previous = body.previousPlans ?? [];
  if (previous.length > 0) {
    const spoken = previous
      .map(
        (p) =>
          `${p.name}, which you were on until ${spokenDate(p.endedOn)} and included ${spokenData(p.inclusions.dataMB)} of data`
      )
      .join(", and before that ");
    parts.push(
      `Before this you were on ${spoken}. I can text you the details of any of these if that would help.`
    );
  }

  parts.push("Does that resolve your question?");
  return parts.join(" ");
}

/**
 * UC3 Branch A: what the agent says after texting the plan details.
 *
 * The 500 case is the one that matters — the gateway is down, so the agent must
 * NOT claim a text is on its way. The spec makes reading the plan aloud this
 * branch's designated fallback, so the call continues rather than escalating.
 */
export function planSendReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    const code = body.error?.code;
    if (code === "422") {
      // Two different 422s: nothing to send at all, versus a plan that isn't
      // theirs. The caller needs a different sentence for each.
      if (/no active plan/i.test(body.error?.message ?? "")) {
        return "You're not on a plan at the moment — you're on pay-as-you-go, so there are no plan details to send. Would you like me to go through the plans available instead?";
      }
      return "I don't have that plan on your account, sorry. Let me read you the plans I do have on file, and you can tell me which one you meant.";
    }
    if (code === "404") {
      return "I'm sorry — I can't find an account on this number. Let me put you through to a colleague who can help.";
    }
    // 500 and anything else: no SMS went out, so don't promise one.
    return "I wasn't able to text you just now, sorry — but I can read the details out instead. Shall I go through your plan and what it includes?";
  }

  const { subscriber, content } = body;
  const parts = [`Thanks ${subscriber.name}.`];

  parts.push(
    content.scope === "PREVIOUS"
      ? `I've sent the details of your previous plan, ${content.planName}, to your number by SMS.`
      : `I've sent your ${content.planName} plan details to your number by SMS.`
  );

  if (content.includesAddOns) {
    parts.push("Your add-on services are listed in there too.");
  }

  parts.push("Does that resolve your question, or is there anything else I can help with?");
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

/**
 * UC3 Branch B: what the agent says after fetching recommendations. Reads the
 * top pick; the rest of `plans[]` is there for "no, give me a different one"
 * without a second API call — the readback doesn't need to enumerate them.
 */
export function planRecommendationsReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    return "I'm sorry — I can't pull up plan options right now. Let me put you through to a colleague who can help.";
  }

  const { subscriber, plans } = body;

  if (plans.length === 0) {
    return `You're already on our best available plan, ${subscriber.name}, so there's nothing bigger to move you to. Is there anything else I can help with?`;
  }

  const top = plans[0];
  // The cycle is read from the plan itself, not assumed — SMART-MINI-1 is
  // WEEKLY, and saying "a month" for it would misstate the billing cycle.
  return `${subscriber.name}, I'd recommend ${top.name} at ${spokenAmount(top.price)} ${spokenCycle(top.price.cycle)} — it includes ${spokenData(top.inclusions.dataMB)} of data, ${top.inclusions.onNetMinutes} on-net and ${top.inclusions.offNetMinutes} off-net minutes, and ${top.inclusions.smsCount} SMS. Would you like to proceed with this plan, or see a different option?`;
}

/**
 * UC3 Branch B: what the agent says after sending the plan-change link.
 *
 * The 500 case matters most — the gateway is down, so the agent must NOT
 * promise a link is on its way.
 */
export function planChangeReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    const code = body.error?.code;
    if (code === "422") {
      return "That plan isn't one I can switch you to, sorry — let me check the options again with you.";
    }
    if (code === "404") {
      return "I'm sorry — I can't find an account on this number. Let me put you through to a colleague who can help.";
    }
    return "I wasn't able to send the plan-change link just now, sorry. Let me put you through to a colleague who can complete this for you.";
  }

  const { subscriber, change } = body;
  return `Thanks ${subscriber.name}. I've sent a link to switch you to ${change.planName} — it's in your SMS and your Smart app notifications. Once you confirm it, let's check the charge went through.`;
}

/**
 * UC3 Branch B: what the agent says after the Smart App push notification.
 * Fails soft the same way as every SMS endpoint — a 500 here must not be
 * described as a notification having gone out.
 */
export function notificationReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    // No separate wording needed: this call always follows the SMS deep-link
    // in the same step, so a failure here is covered by the same fallback —
    // the plan-change link's own confirmation already told the caller what to
    // expect, and the agent doesn't narrate the push channel separately.
    return "I wasn't able to send the app notification just now — the SMS link still works, so let's continue with that.";
  }

  const { notification } = body;
  return `I've also sent a notification to your Smart app: "${notification.title}".`;
}

/** UC4 Branch 2: confirm the deactivation SMS without claiming the service is already off. */
export function serviceDeactivationReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    if (body.error?.code === "422") {
      return "That service isn't active on this number, so there is nothing to deactivate.";
    }
    if (body.error?.code === "404") {
      return "I'm sorry — I can't find an account on this number. Let me put you through to a colleague who can help.";
    }
    return "I wasn't able to text the deactivation link just now, but I can still guide you through the USSD steps.";
  }

  const { subscriber, deactivation } = body;
  return `Thanks ${subscriber.name}. I've sent an SMS with the link to deactivate ${deactivation.serviceName}. It is valid for the next 24 hours, and the USSD code is ${deactivation.ussdCode}.`;
}

/** UC4 Branch 3: report the validity state and its expiry. */
export function simStatusReadback(body) {
  if (!body) return null;

  if (body.status === "FAILURE") {
    if (body.error?.code === "404") {
      return "I'm sorry — I can't find an account on this number. Let me put you through to a colleague who can help.";
    }
    return "I'm sorry — I can't check the SIM status right now. Let me put you through to a colleague who can help.";
  }

  const { subscriber, validity } = body;
  const expiry = spokenDate(validity.expiryDate);
  const state = {
    FULL: "fully active",
    ONE_WAY: "in one-way validity, so incoming calls are available only",
    TWO_WAY: "in two-way validity, so incoming and outgoing calls are restricted",
  }[validity.type] ?? validity.type;
  return `${subscriber.name}, your number is ${state}. This validity state expires on ${expiry}.`;
}

/** UC5 Branch 1: report a known outage or continue to troubleshooting. */
export function incidentStatusReadback(body) {
  if (!body) return null;
  if (body.status === "FAILURE") {
    return "I'm sorry — I can't check the outage status right now. Let me put you through to a colleague who can help.";
  }
  const { subscriber, incident } = body;
  if (!incident.found) {
    return `${subscriber.name}, I can't see a known outage for your number right now. Let me guide you through some troubleshooting steps.`;
  }
  return `${subscriber.name}, there is a known issue: ${incident.summary} The expected restoration time is ${spokenDate(incident.expectedRestorationAt)}.`;
}

/** UC5 Branch 3: read back the current open complaint/enquiry cases. */
export function complaintHistoryReadback(body) {
  if (!body) return null;
  if (body.status === "FAILURE") {
    return "I'm sorry — I can't retrieve your complaint status right now. Let me put you through to a colleague who can help.";
  }
  if (body.complaints.length === 0) {
    return "I can't find any open complaints or enquiries on this number. Is there anything else I can help with?";
  }
  const current = body.complaints[0];
  return `Your ${current.type.toLowerCase()} ${current.caseId} is ${current.status.toLowerCase()}. ${current.summary} It was last updated on ${spokenDate(current.lastUpdatedAt.slice(0, 8))}.`;
}

/** UC5 Branch 2: confirm the troubleshooting SMS without claiming resolution. */
export function troubleshootingLinkReadback(body) {
  if (!body) return null;
  if (body.status === "FAILURE") {
    return "I wasn't able to text the troubleshooting link just now, but I can continue guiding you through the steps.";
  }
  const { troubleshooting } = body;
  return `I've sent the troubleshooting steps to your number by SMS. The link is valid for 24 hours. Please try them and let me know whether the issue is resolved.`;
}
