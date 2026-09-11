import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { notFound, internal } from "../utils/errors.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forcePlanErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /account/plan_details, in the spec's key
 * order: subscriber, plan, services, previousPlans.
 *
 * `plan` is null and `services` empty for a pay-as-you-go subscriber, or one
 * whose pack has expired — a valid SUCCESS, not a failure. Subscribers added
 * through the demo endpoint land here too, since the mock has no plan on file
 * for them.
 *
 * `previousPlans` was added for UC3 Branch A ("Current Active Plan, Last 2
 * Plans"). It is appended LAST and never changes an existing field, so UC1
 * Branch C callers can ignore it entirely.
 *
 * Unlike Branch B there is no diagnosis step: the agent's only decision after
 * this call is whether the caller is satisfied.
 *
 * @throws AppError 404 unknown number · 500 forced demo failure
 */
export async function getPlanDetails(msisdn) {
  if (isForcedError(msisdn)) {
    throw internal();
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    plan: plan(subscriber.plan),
    services: (subscriber.services ?? []).map(service),
    previousPlans: visiblePreviousPlans(subscriber),
  };
}

/**
 * The previous plans this subscriber is allowed to hear about: newest-ended
 * first, capped at `maxPreviousPlans`.
 *
 * Sorting here rather than trusting the stored order means a hand-edited seed
 * or a subscriber added out of order can't make the agent read history
 * backwards — and the cap is applied AFTER the sort, so it always keeps the
 * most recent plans rather than whichever happened to be stored first.
 *
 * Exported because `/plan/send_details` selects from exactly this list. Sharing
 * the helper is what stops the two endpoints disagreeing about which plans
 * exist — an agent must never be able to text a plan the caller was never read.
 */
export function visiblePreviousPlans(subscriber) {
  return (subscriber.previousPlans ?? [])
    .slice()
    .sort((a, b) => (a.endedOn < b.endedOn ? 1 : a.endedOn > b.endedOn ? -1 : 0))
    .slice(0, config.maxPreviousPlans)
    .map(previousPlan);
}

/** planId, name, price, activatedOn, endedOn, inclusions. */
const previousPlan = (value) => ({
  planId: value.planId,
  name: value.name,
  price: price(value.price),
  activatedOn: value.activatedOn,
  // Not `renewsOn`: an ended plan does not renew.
  endedOn: value.endedOn,
  inclusions: {
    dataMB: value.inclusions.dataMB,
    onNetMinutes: value.inclusions.onNetMinutes,
    offNetMinutes: value.inclusions.offNetMinutes,
    smsCount: value.inclusions.smsCount,
  },
});

/** planId, name, price, activatedOn, renewsOn, inclusions — or null. */
function plan(value) {
  if (!value) return null;
  return {
    planId: value.planId,
    name: value.name,
    price: price(value.price),
    activatedOn: value.activatedOn,
    renewsOn: value.renewsOn,
    inclusions: {
      dataMB: value.inclusions.dataMB,
      onNetMinutes: value.inclusions.onNetMinutes,
      offNetMinutes: value.inclusions.offNetMinutes,
      smsCount: value.inclusions.smsCount,
    },
  };
}

const service = (value) => ({
  serviceId: value.serviceId,
  name: value.name,
  price: price(value.price),
  activatedOn: value.activatedOn,
  renewsOn: value.renewsOn,
});

const price = (value) => ({
  amount: value.amount,
  currency: value.currency,
  cycle: value.cycle,
});
