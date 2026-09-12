/**
 * Contract tests for POST /plan/send_change_link (UC3 Branch B).
 *
 * The project's THIRD action endpoint. Nothing is really texted, so these
 * assert both the response and the persisted row.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app, post, setupDb, resetDb, teardownDb } from "./helpers.js";
import { PlanChangeLink } from "../src/models/PlanChangeLink.js";
import { Subscriber } from "../src/models/Subscriber.js";

const SPEC_PLAN = {
  planId: "SMART-COMBO-5",
  name: "Smart Combo 5",
  price: { amount: 5.0, currency: "USD", cycle: "MONTHLY" },
  activatedOn: "20260831",
  renewsOn: "20260930",
  inclusions: { dataMB: 10240, onNetMinutes: 300, offNetMinutes: 60, smsCount: 100 },
};

before(() => setupDb("plan_change_link"));
beforeEach(async () => {
  await resetDb();
  // resetDb's default subscriber has no plan set — give it one so
  // /plan/send_details (used only by the id-collision test below) succeeds.
  await Subscriber.updateOne({ msisdn: "85510234567" }, { $set: { plan: SPEC_PLAN } });
  await Subscriber.create({
    msisdn: "9870566624",
    name: "Raghav Kumaria",
    type: "PREPAID",
    balance: { main: { amount: 8.5, currency: "USD", expiry: "20261010" }, bonus: null },
    data: { allowanceMB: 20480, usedMB: 5000, remainingMB: 15480, expiry: "20261010" },
  });
});
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-pch-001",
  timestamp: "20260911120100",
  msisdn: "85510234567",
  planId: "SMART-COMBO-10",
  ...overrides,
});

test("SUCCESS body matches the spec example exactly", async () => {
  const res = await post("/plan/send_change_link").send(req());

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "message",
    "change",
  ]);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-pch-001");

  assert.deepEqual(res.body.subscriber, {
    msisdn: "85510234567",
    name: "Sok Dara",
    type: "PREPAID",
  });

  assert.deepEqual(Object.keys(res.body.message), [
    "messageId",
    "channel",
    "to",
    "status",
    "sentAt",
    "resendCount",
  ]);
  assert.equal(res.body.message.channel, "SMS");
  assert.equal(res.body.message.to, "85510234567");
  assert.equal(res.body.message.status, "SENT");
  assert.equal(res.body.message.resendCount, 0);

  assert.deepEqual(Object.keys(res.body.change), ["planId", "planName", "link"]);
  assert.equal(res.body.change.planId, "SMART-COMBO-10");
  assert.equal(res.body.change.planName, "Smart Combo 10");
  assert.deepEqual(Object.keys(res.body.change.link), ["reference", "url", "expiresAt"]);
  assert.match(res.body.change.link.reference, /^PCH-\d{8}-\d{4}$/);
  assert.ok(res.body.change.link.url.includes("SMART-COMBO-10"));
});

test("messageId uses the SMS-PCH- prefix", async () => {
  const res = await post("/plan/send_change_link").send(req());
  assert.match(res.body.message.messageId, /^SMS-PCH-\d{8}-\d{4}$/);
});

test("the plan-change SMS series cannot collide with the other two SMS series", async () => {
  const pch = await post("/plan/send_change_link").send(req());
  const pln = await post("/plan/send_details").send({
    requestId: "req-pln-001",
    timestamp: "20260911120000",
    msisdn: "85510234567",
  });
  const rcg = await post("/recharge/send_link").send({
    requestId: "req-rcg-001",
    timestamp: "20260911120000",
    msisdn: "85510234567",
    amount: 5.0,
  });

  assert.equal(pln.body.status, "SUCCESS");
  assert.equal(rcg.body.status, "SUCCESS");

  const ids = [pch.body.message.messageId, pln.body.message.messageId, rcg.body.message.messageId];
  assert.equal(new Set(ids).size, 3, "all three SMS series must produce distinct ids");
  assert.match(ids[0], /^SMS-PCH-/);
  assert.match(ids[1], /^SMS-PLN-/);
  assert.match(ids[2], /^SMS-\d{8}-/); // recharge series has no letter segment
});

test("the send is actually persisted, not just reported", async () => {
  const res = await post("/plan/send_change_link").send(req());

  const stored = await PlanChangeLink.findOne({
    messageId: res.body.message.messageId,
  }).lean();

  assert.ok(stored, "a SUCCESS must leave a row behind");
  assert.equal(stored.planId, "SMART-COMBO-10");
  assert.equal(stored.msisdn, "85510234567");
  assert.equal(stored.requestId, "req-pch-001");
});

test("resendCount counts today's earlier sends for the same subscriber", async () => {
  const first = await post("/plan/send_change_link").send(req());
  const second = await post("/plan/send_change_link").send(
    req({ requestId: "req-pch-002" })
  );

  assert.equal(first.body.message.resendCount, 0);
  assert.equal(second.body.message.resendCount, 1);
});

test("resendCount is per subscriber, not global", async () => {
  await post("/plan/send_change_link").send(req());
  const other = await post("/plan/send_change_link").send(
    req({ requestId: "req-pch-002", msisdn: "9870566624", planId: "SMART-POSTPAID-10" })
  );
  assert.equal(other.body.message.resendCount, 0);
});

test("an unrecognised planId is a 422 FAILURE, still HTTP 200", async () => {
  const res = await post("/plan/send_change_link").send(
    req({ planId: "NOT-A-REAL-PLAN" })
  );

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "msisdn",
  ]);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
  assert.match(res.body.error.message, /not a plan we offer/);
});

test("the 422 check runs before the subscriber lookup — an unknown plan for an unknown number is still 422", async () => {
  // Mirrors the amount-before-lookup ordering in /recharge/send_link: a bad
  // business input is bad whether or not the account exists.
  const res = await post("/plan/send_change_link").send(
    req({ msisdn: "85510000000", planId: "NOT-A-REAL-PLAN" })
  );
  assert.equal(res.body.error.code, "422", "unknown plan wins over unknown number");
});

test("nothing is persisted when the plan is unrecognised", async () => {
  await post("/plan/send_change_link").send(req({ planId: "NOT-A-REAL-PLAN" }));
  assert.equal(await PlanChangeLink.countDocuments({}), 0);
});

test("unknown number (with a real plan) is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/plan/send_change_link").send(
    req({ msisdn: "85510000000" })
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "404");
  assert.equal(res.body.msisdn, "85510000000");
});

test("forced-failure msisdn returns a 500 — the gateway-down demo", async () => {
  const res = await post("/plan/send_change_link").send(
    req({ msisdn: "85510999500" })
  );
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
  assert.equal(res.body.error.message, "Plan change service unavailable");
});

test("the forced 500 wins over a would-be 404 or 422", async () => {
  const res = await post("/plan/send_change_link").send(
    req({ msisdn: "85510999500", planId: "NOT-A-REAL-PLAN" })
  );
  assert.equal(res.body.error.code, "500");
});

test("nothing is persisted on a 404 or 500 failure", async () => {
  await post("/plan/send_change_link").send(req({ msisdn: "85510000000" }));
  await post("/plan/send_change_link").send(req({ msisdn: "85510999500" }));
  assert.equal(await PlanChangeLink.countDocuments({}), 0);
});

for (const [label, body] of [
  ["missing requestId", req({ requestId: undefined })],
  ["missing timestamp", req({ timestamp: undefined })],
  ["missing msisdn", req({ msisdn: undefined })],
  ["missing planId", req({ planId: undefined })],
  ["empty planId", req({ planId: "" })],
  ["non-string planId", req({ planId: 12345 })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/plan/send_change_link").send(body);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
    assert.match(res.body.error.message, /^Malformed request: /);
  });
}

test("requires the API key", async () => {
  const res = await supertest(app).post("/plan/send_change_link").send(req());
  assert.equal(res.status, 401);
});

test("a rejected key sends nothing", async () => {
  await supertest(app)
    .post("/plan/send_change_link")
    .set("x-api-key", "not-a-real-key")
    .send(req());
  assert.equal(await PlanChangeLink.countDocuments({}), 0);
});

test("GET /demo/plan_change_links lists what was sent, newest first", async () => {
  await post("/plan/send_change_link").send(req());
  await post("/plan/send_change_link").send(
    req({ requestId: "req-pch-002", planId: "SMART-POSTPAID-10" })
  );

  const res = await supertest(app)
    .get("/demo/plan_change_links")
    .set("x-api-key", (process.env.API_KEYS || "").split(",")[0]);

  assert.equal(res.status, 200);
  assert.equal(res.body.planChangeLinks.length, 2);
  const ids = res.body.planChangeLinks.map((l) => l.reference);
  assert.deepEqual(ids, [...ids].sort().reverse(), "newest first");
  for (const l of res.body.planChangeLinks) {
    assert.equal(l._id, undefined);
    assert.equal(l.__v, undefined);
  }
});

test("GET /demo/plan_change_links requires the API key", async () => {
  const res = await supertest(app).get("/demo/plan_change_links");
  assert.equal(res.status, 401);
});
