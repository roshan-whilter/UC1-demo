/**
 * The shared plan catalog behind UC3 Branch B — recommendations and plan
 * changes. Unlike every other branch's plan data, this is NOT per-subscriber:
 * every caller sees the same six plans, ranked by `tier` (1 = smallest).
 *
 * Kept in sync BY HAND with plan data that already exists elsewhere in the
 * seed, since the same planIds appear there too:
 *   - SMART-MINI-1, SMART-COMBO-3   — previousPlans seeded for UC3 Branch A
 *   - SMART-COMBO-5, SMART-COMBO-10 — currently-active plans in the seed
 *   - SMART-POSTPAID-10             — previousPlans seeded for UC3 Branch A
 *   - SMART-POSTPAID-20             — currently-active plans in the seed
 * `server/tests/planCatalog.test.js` asserts this catalog agrees with the
 * shipped seed file wherever a planId appears in both places, so the two
 * can't silently drift apart.
 */
export const PLAN_CATALOG = [
  {
    tier: 1,
    planId: "SMART-MINI-1",
    name: "Smart Mini 1",
    price: { amount: 1.0, currency: "USD", cycle: "WEEKLY" },
    inclusions: { dataMB: 1024, onNetMinutes: 50, offNetMinutes: 0, smsCount: 20 },
  },
  {
    tier: 2,
    planId: "SMART-COMBO-3",
    name: "Smart Combo 3",
    price: { amount: 3.0, currency: "USD", cycle: "MONTHLY" },
    inclusions: { dataMB: 5120, onNetMinutes: 150, offNetMinutes: 30, smsCount: 50 },
  },
  {
    tier: 3,
    planId: "SMART-COMBO-5",
    name: "Smart Combo 5",
    price: { amount: 5.0, currency: "USD", cycle: "MONTHLY" },
    inclusions: { dataMB: 10240, onNetMinutes: 300, offNetMinutes: 60, smsCount: 100 },
  },
  {
    tier: 4,
    planId: "SMART-COMBO-10",
    name: "Smart Combo 10",
    price: { amount: 10.0, currency: "USD", cycle: "MONTHLY" },
    inclusions: { dataMB: 20480, onNetMinutes: 600, offNetMinutes: 120, smsCount: 200 },
  },
  {
    tier: 5,
    planId: "SMART-POSTPAID-10",
    name: "Smart Postpaid 10",
    price: { amount: 10.0, currency: "USD", cycle: "MONTHLY" },
    inclusions: { dataMB: 20480, onNetMinutes: 500, offNetMinutes: 150, smsCount: 250 },
  },
  {
    tier: 6,
    planId: "SMART-POSTPAID-20",
    name: "Smart Postpaid 20",
    price: { amount: 20.0, currency: "USD", cycle: "MONTHLY" },
    inclusions: { dataMB: 51200, onNetMinutes: 1000, offNetMinutes: 300, smsCount: 500 },
  },
];

/** The catalog entry for a planId, or null if it isn't one we offer. */
export function findCatalogPlan(planId) {
  return PLAN_CATALOG.find((p) => p.planId === planId) ?? null;
}

/** The tier of a planId — 0 for "no plan" or a planId outside the catalog. */
export function tierOf(planId) {
  const entry = findCatalogPlan(planId);
  return entry ? entry.tier : 0;
}
