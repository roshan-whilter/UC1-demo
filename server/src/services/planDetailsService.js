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
 * order: subscriber, plan, services.
 *
 * `plan` is null and `services` empty for a pay-as-you-go subscriber, or one
 * whose pack has expired — a valid SUCCESS, not a failure. Subscribers added
 * through the demo endpoint land here too, since the mock has no plan on file
 * for them.
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
  };
}

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
