/**
 * Contract tests for POST /plan/recommendations (UC3 Branch B).
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app, post, setupDb, resetDb, teardownDb } from "./helpers.js";
import { Subscriber } from "../src/models/Subscriber.js";

const SPEC_PLAN = {
  planId: "SMART-COMBO-5",
  name: "Smart Combo 5",
  price: { amount: 5.0, currency: "USD", cycle: "MONTHLY" },
  activatedOn: "20260831",
  renewsOn: "20260930",
  inclusions: { dataMB: 10240, onNetMinutes: 300, offNetMinutes: 60, smsCount: 100 },
};

before(() => setupDb("plan_recommendations"));
beforeEach(async () => {
  await resetDb();
  await Subscriber.updateOne({ msisdn: "85510234567" }, { $set: { plan: SPEC_PLAN } });
  await Subscriber.create({
    msisdn: "85510777222",
    name: "Kim Veasna",
    type: "PREPAID",
    balance: { main: { amount: 0, currency: "USD", expiry: "20260912" }, bonus: null },
    data: { allowanceMB: 2048, usedMB: 2048, remainingMB: 0, expiry: "20260912" },
    plan: null,
    services: [],
  });
  await Subscriber.create({
    msisdn: "919899047146",
    name: "Ravinder Malhotra",
    type: "POSTPAID",
    balance: { main: { amount: 15.75, currency: "USD", expiry: "20261130" }, bonus: null },
    data: { allowanceMB: 51200, usedMB: 20480, remainingMB: 30720, expiry: "20261015" },
    plan: {
      planId: "SMART-POSTPAID-20",
      name: "Smart Postpaid 20",
      price: { amount: 20.0, currency: "USD", cycle: "MONTHLY" },
      activatedOn: "20260515",
      renewsOn: "20261015",
      inclusions: { dataMB: 51200, onNetMinutes: 1000, offNetMinutes: 300, smsCount: 500 },
    },
    services: [],
  });
  await Subscriber.create({
    msisdn: "9870566624",
    name: "Raghav Kumaria",
    type: "PREPAID",
    balance: { main: { amount: 8.5, currency: "USD", expiry: "20261010" }, bonus: null },
    data: { allowanceMB: 20480, usedMB: 5000, remainingMB: 15480, expiry: "20261010" },
    plan: {
      planId: "SMART-COMBO-10",
      name: "Smart Combo 10",
      price: { amount: 10.0, currency: "USD", cycle: "MONTHLY" },
      activatedOn: "20260910",
      renewsOn: "20261010",
      inclusions: { dataMB: 20480, onNetMinutes: 600, offNetMinutes: 120, smsCount: 200 },
    },
    services: [],
  });
});
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-rec-001",
  timestamp: "20260911120000",
  msisdn: "85510234567",
  ...overrides,
});

test("SUCCESS body matches the spec example exactly (Sok Dara, on Combo 5)", async () => {
  const res = await post("/plan/recommendations").send(req());

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "plans",
  ]);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-rec-001");
  assert.deepEqual(res.body.subscriber, {
    msisdn: "85510234567",
    name: "Sok Dara",
    type: "PREPAID",
  });

  assert.equal(res.body.plans.length, 3, "three plans bigger than Combo 5");
  assert.deepEqual(
    res.body.plans.map((p) => p.planId),
    ["SMART-COMBO-10", "SMART-POSTPAID-10", "SMART-POSTPAID-20"],
    "tier-ascending, closest upgrade first"
  );
});

test("plan key order and shape", async () => {
  const res = await post("/plan/recommendations").send(req());
  assert.deepEqual(Object.keys(res.body.plans[0]), [
    "planId",
    "name",
    "price",
    "inclusions",
    "recommended",
    "reason",
  ]);
  assert.deepEqual(Object.keys(res.body.plans[0].price), ["amount", "currency", "cycle"]);
  assert.deepEqual(Object.keys(res.body.plans[0].inclusions), [
    "dataMB",
    "onNetMinutes",
    "offNetMinutes",
    "smsCount",
  ]);
});

test("only the first (closest-upgrade) plan is flagged recommended, with a reason", async () => {
  const res = await post("/plan/recommendations").send(req());
  const [first, ...rest] = res.body.plans;

  assert.equal(first.recommended, true);
  assert.equal(typeof first.reason, "string");
  assert.ok(first.reason.length > 0);

  for (const p of rest) {
    assert.equal(p.recommended, false, `${p.planId} must not be flagged recommended`);
    assert.equal(p.reason, null, `${p.planId} must have no reason`);
  }
});

test("the SMART-POSTPAID-10 entry matches the canonical seeded values, not a placeholder", async () => {
  // Regression guard for the exact mismatch caught during the build: the
  // approved spec's illustrative example used $15/30720MB, which did not
  // match what UC3-A had already seeded for Chan Sophea/Ravinder ($10/20480MB).
  const res = await post("/plan/recommendations").send(req());
  const postpaid10 = res.body.plans.find((p) => p.planId === "SMART-POSTPAID-10");

  assert.ok(postpaid10, "SMART-POSTPAID-10 should be recommended to a Combo-5 subscriber");
  assert.deepEqual(postpaid10.price, { amount: 10.0, currency: "USD", cycle: "MONTHLY" });
  assert.deepEqual(postpaid10.inclusions, {
    dataMB: 20480,
    onNetMinutes: 500,
    offNetMinutes: 150,
    smsCount: 250,
  });
});

test("a subscriber already on the top plan gets plans: [] — a SUCCESS, not an error", async () => {
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "919899047146" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS", "not a failure — the lookup worked");
  assert.deepEqual(res.body.plans, []);
});

test("a subscriber one tier down from the top gets exactly the two bigger plans", async () => {
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "9870566624" })
  );

  assert.equal(res.body.plans.length, 2);
  assert.deepEqual(
    res.body.plans.map((p) => p.planId),
    ["SMART-POSTPAID-10", "SMART-POSTPAID-20"]
  );
});

test("a subscriber with no plan at all sees the whole catalog", async () => {
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "85510777222" })
  );

  assert.equal(res.body.plans.length, 6, "every catalog plan is an upgrade from pay-as-you-go");
  assert.deepEqual(
    res.body.plans.map((p) => p.planId),
    [
      "SMART-MINI-1",
      "SMART-COMBO-3",
      "SMART-COMBO-5",
      "SMART-COMBO-10",
      "SMART-POSTPAID-10",
      "SMART-POSTPAID-20",
    ]
  );
  assert.match(
    res.body.plans[0].reason,
    /pay-as-you-go/i,
    "the reason should acknowledge there was no plan before"
  );
});

test("a pay-as-you-go reason names the recommended plan's OWN billing cycle", async () => {
  // SMART-MINI-1 is the only tier-1 plan, so it's always the top pick for a
  // pay-as-you-go subscriber — and it is WEEKLY, not MONTHLY. A hardcoded
  // "monthly plan" would misstate the cycle every single time this path fires.
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "85510777222" })
  );

  assert.equal(res.body.plans[0].planId, "SMART-MINI-1");
  assert.match(res.body.plans[0].reason, /weekly plan/i);
  assert.doesNotMatch(res.body.plans[0].reason, /monthly/i);
});

test("the reason never claims 'more data and minutes' when they aren't actually more", async () => {
  // Raghav's top recommendation (Combo 10 -> Postpaid 10) has the SAME data
  // allowance and FEWER total minutes than his current plan. Regression test
  // for a real defect: the reason text must not lie about the plan it names.
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "9870566624" })
  );

  const top = res.body.plans[0];
  assert.equal(top.planId, "SMART-POSTPAID-10");
  assert.equal(
    top.inclusions.dataMB,
    20480,
    "precondition: same data as Combo 10, not more"
  );
  assert.ok(
    top.inclusions.onNetMinutes + top.inclusions.offNetMinutes < 720,
    "precondition: fewer total minutes than Combo 10's 720"
  );

  assert.doesNotMatch(
    top.reason,
    /more data/i,
    "data did not increase — the reason must not claim it did"
  );
  assert.doesNotMatch(
    top.reason,
    /more.*minutes/i,
    "minutes did not increase — the reason must not claim they did"
  );
});

test("the reason claims more data only when data actually increased", async () => {
  const res = await post("/plan/recommendations").send(req()); // Sok Dara, Combo 5
  const top = res.body.plans[0];

  assert.equal(top.planId, "SMART-COMBO-10");
  assert.ok(top.inclusions.dataMB > SPEC_PLAN.inclusions.dataMB, "precondition: more data");
  assert.match(top.reason, /more data/i);
  assert.match(top.reason, /minutes/i);
});

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "85510000000" })
  );

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "msisdn",
  ]);
  assert.deepEqual(res.body.error, { code: "404", message: "Subscriber not found" });
});

test("forced-failure msisdn returns a 500 FAILURE", async () => {
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "85510999500" })
  );
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
});

test("error.code is a string, not a number", async () => {
  const res = await post("/plan/recommendations").send(
    req({ msisdn: "85510000000" })
  );
  assert.equal(typeof res.body.error.code, "string");
});

for (const [label, body] of [
  ["missing requestId", req({ requestId: undefined })],
  ["missing timestamp", req({ timestamp: undefined })],
  ["missing msisdn", req({ msisdn: undefined })],
  ["short timestamp", req({ timestamp: "202609111200" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/plan/recommendations").send(body);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
  });
}

test("country-code tolerant lookup works here too", async () => {
  for (const dialled of ["85510234567", "+85510234567", "+855 10 234 567"]) {
    const res = await post("/plan/recommendations").send(req({ msisdn: dialled }));
    assert.equal(res.body.status, "SUCCESS", `${dialled} should resolve`);
    assert.equal(res.body.subscriber.msisdn, "85510234567");
  }
});

test("requires the API key", async () => {
  const res = await supertest(app).post("/plan/recommendations").send(req());
  assert.equal(res.status, 401);
});
