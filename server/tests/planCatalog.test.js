/**
 * Guards the shared plan catalog behind UC3 Branch B against drifting away
 * from the plan data that already exists elsewhere in the shipped seed —
 * several planIds (SMART-MINI-1, SMART-COMBO-3, SMART-COMBO-5,
 * SMART-COMBO-10, SMART-POSTPAID-10, SMART-POSTPAID-20) appear in both
 * places, and nothing else enforces they agree.
 *
 * This test caught a real mismatch during the UC3-B build: the approved
 * spec's illustrative example for SMART-POSTPAID-10 used placeholder numbers
 * ($15, 30720 MB) that didn't match what UC3-A had already seeded for Chan
 * Sophea and Ravinder ($10, 20480 MB). The catalog was built to match the
 * seed, not the placeholder — this test is what pins that decision.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAN_CATALOG, findCatalogPlan, tierOf } from "../src/data/planCatalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(__dirname, "../seed/subscribers.json");
const subscribers = JSON.parse(await readFile(SEED, "utf8"));

test("every catalog plan has a unique planId and a unique, ascending tier", () => {
  const ids = PLAN_CATALOG.map((p) => p.planId);
  assert.equal(new Set(ids).size, ids.length, "planIds must be unique");

  const tiers = PLAN_CATALOG.map((p) => p.tier);
  assert.equal(new Set(tiers).size, tiers.length, "tiers must be unique");
  assert.deepEqual(
    tiers,
    [...tiers].sort((a, b) => a - b),
    "the catalog must be stored in ascending tier order"
  );
});

test("catalog plans agree with the same planId wherever it appears in the seed", () => {
  let checked = 0;

  for (const s of subscribers) {
    const candidates = [s.plan, ...(s.previousPlans ?? [])].filter(Boolean);
    for (const seeded of candidates) {
      const catalogEntry = findCatalogPlan(seeded.planId);
      if (!catalogEntry) continue; // not every seeded plan needs to be in the catalog

      checked += 1;
      assert.equal(catalogEntry.name, seeded.name, `${seeded.planId} name`);
      assert.deepEqual(catalogEntry.price, seeded.price, `${seeded.planId} price`);
      assert.deepEqual(
        catalogEntry.inclusions,
        seeded.inclusions,
        `${seeded.planId} inclusions`
      );
    }
  }

  assert.ok(
    checked >= 4,
    "expected several seeded plans to cross-check against the catalog — got none, so this test may not be exercising anything"
  );
});

test("tierOf resolves every seeded planId to a real tier, and unknowns to 0", () => {
  for (const s of subscribers) {
    const candidates = [s.plan, ...(s.previousPlans ?? [])].filter(Boolean);
    for (const seeded of candidates) {
      if (!findCatalogPlan(seeded.planId)) continue;
      assert.ok(tierOf(seeded.planId) > 0, `${seeded.planId} should have a tier`);
    }
  }

  assert.equal(tierOf("NOT-A-REAL-PLAN"), 0);
  assert.equal(tierOf(undefined), 0);
});

test("findCatalogPlan returns null, not undefined, for an unknown planId", () => {
  assert.equal(findCatalogPlan("NOT-A-REAL-PLAN"), null);
});
