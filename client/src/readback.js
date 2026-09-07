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
