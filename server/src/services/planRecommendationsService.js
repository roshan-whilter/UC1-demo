import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { notFound, internal } from "../utils/errors.js";
import { PLAN_CATALOG, tierOf } from "../data/planCatalog.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forcePlanRecommendationsErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /plan/recommendations, in the spec's key
 * order: subscriber, plans.
 *
 * `plans[]` is every catalog plan with a HIGHER tier than the subscriber's
 * current one (tier 0 for pay-as-you-go), sorted tier-ascending. That means
 * the first entry is both the closest upgrade AND the one flagged
 * `recommended: true` — deliberately the FULL alternative list, not just the
 * top pick, so "no, give me a different one" needs no second API call: the
 * caller's choice is already in this same response.
 *
 * @throws AppError 404 unknown number · 500 forced demo failure
 */
export async function getPlanRecommendations(msisdn) {
  if (isForcedError(msisdn)) {
    throw internal();
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const currentTier = subscriber.plan ? tierOf(subscriber.plan.planId) : 0;
  const eligible = PLAN_CATALOG.filter((p) => p.tier > currentTier).sort(
    (a, b) => a.tier - b.tier
  );

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    plans: eligible.map((p, i) => ({
      planId: p.planId,
      name: p.name,
      price: p.price,
      inclusions: p.inclusions,
      recommended: i === 0,
      reason: i === 0 ? reasonFor(subscriber, p) : null,
    })),
  };
}

/**
 * The one-line reason shown only on the top recommendation.
 *
 * Computed from the actual numbers rather than a fixed string: the catalog is
 * ranked by tier, not by "every field goes up" — SMART-COMBO-10 to
 * SMART-POSTPAID-10 (the recommendation for Raghav, one of the seeded demo
 * numbers) has the SAME data allowance and FEWER total minutes, so a hardcoded
 * "more data and minutes" would be a false claim the agent speaks verbatim.
 * The pay-as-you-go case also reads the plan's own billing cycle rather than
 * assuming MONTHLY — SMART-MINI-1, the only tier-1 plan, is WEEKLY.
 */
function reasonFor(subscriber, recommended) {
  if (!subscriber.plan) {
    return `Move from pay-as-you-go to a ${recommended.price.cycle.toLowerCase()} plan with included data and minutes`;
  }

  const current = subscriber.plan.inclusions;
  const upgrade = recommended.inclusions;
  const moreData = upgrade.dataMB > current.dataMB;
  const moreMinutes =
    upgrade.onNetMinutes + upgrade.offNetMinutes >
    current.onNetMinutes + current.offNetMinutes;

  if (moreData && moreMinutes) return "More data and minutes than your current plan";
  if (moreData) return "More data than your current plan";
  if (moreMinutes) return "More calling minutes than your current plan, with the same data allowance";
  return "A better fit for your usage than your current plan";
}
