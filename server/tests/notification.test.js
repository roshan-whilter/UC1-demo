/**
 * Contract tests for POST /notification/send (UC3 Branch B).
 *
 * The project's first non-SMS channel. Modeled the same way as every SMS
 * action endpoint: nothing is really pushed, the send is recorded.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import { app, post, setupDb, resetDb, teardownDb } from "./helpers.js";
import { Notification } from "../src/models/Notification.js";

before(() => setupDb("notification"));
beforeEach(resetDb);
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-not-001",
  timestamp: "20260911120100",
  msisdn: "85510234567",
  planId: "SMART-COMBO-10",
  ...overrides,
});

test("SUCCESS body matches the spec example exactly", async () => {
  const res = await post("/notification/send").send(req());

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "notification",
  ]);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});

  assert.deepEqual(res.body.subscriber, {
    msisdn: "85510234567",
    name: "Sok Dara",
    type: "PREPAID",
  });

  assert.deepEqual(Object.keys(res.body.notification), [
    "notificationId",
    "channel",
    "status",
    "sentAt",
    "title",
    "body",
  ]);
  assert.equal(res.body.notification.channel, "PUSH");
  assert.equal(res.body.notification.status, "SENT");
  assert.equal(res.body.notification.title, "Plan change ready");
  assert.equal(res.body.notification.body, "Tap to confirm your switch to Smart Combo 10.");
});

test("notificationId uses the PUSH- prefix, distinct from every SMS series", async () => {
  const res = await post("/notification/send").send(req());
  assert.match(res.body.notification.notificationId, /^PUSH-\d{8}-\d{4}$/);
});

test("the body text names the plan being switched to", async () => {
  const res = await post("/notification/send").send(
    req({ planId: "SMART-POSTPAID-20" })
  );
  assert.match(res.body.notification.body, /Smart Postpaid 20/);
});

test("the send is actually persisted, not just reported", async () => {
  const res = await post("/notification/send").send(req());

  const stored = await Notification.findOne({
    notificationId: res.body.notification.notificationId,
  }).lean();

  assert.ok(stored, "a SUCCESS must leave a row behind");
  assert.equal(stored.planId, "SMART-COMBO-10");
  assert.equal(stored.channel, "PUSH");
  assert.equal(stored.requestId, "req-not-001");
});

test("an unrecognised planId is a 422 FAILURE, still HTTP 200", async () => {
  const res = await post("/notification/send").send(
    req({ planId: "NOT-A-REAL-PLAN" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
  assert.match(res.body.error.message, /not a plan we offer/);
});

test("nothing is persisted when the plan is unrecognised", async () => {
  await post("/notification/send").send(req({ planId: "NOT-A-REAL-PLAN" }));
  assert.equal(await Notification.countDocuments({}), 0);
});

test("unknown number (with a real plan) is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/notification/send").send(
    req({ msisdn: "85510000000" })
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "404");
  assert.equal(res.body.msisdn, "85510000000");
});

test("forced-failure msisdn returns a 500 — the push-service-down demo", async () => {
  const res = await post("/notification/send").send(
    req({ msisdn: "85510999500" })
  );
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
  assert.equal(res.body.error.message, "Push notification service unavailable");
});

test("nothing is persisted on a 404 or 500 failure", async () => {
  await post("/notification/send").send(req({ msisdn: "85510000000" }));
  await post("/notification/send").send(req({ msisdn: "85510999500" }));
  assert.equal(await Notification.countDocuments({}), 0);
});

for (const [label, body] of [
  ["missing requestId", req({ requestId: undefined })],
  ["missing timestamp", req({ timestamp: undefined })],
  ["missing msisdn", req({ msisdn: undefined })],
  ["missing planId", req({ planId: undefined })],
  ["empty planId", req({ planId: "" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/notification/send").send(body);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
  });
}

test("error.code is a string, not a number", async () => {
  const res = await post("/notification/send").send(
    req({ msisdn: "85510000000" })
  );
  assert.equal(typeof res.body.error.code, "string");
});

test("requires the API key", async () => {
  const res = await supertest(app).post("/notification/send").send(req());
  assert.equal(res.status, 401);
});

test("a rejected key sends nothing", async () => {
  await supertest(app)
    .post("/notification/send")
    .set("x-api-key", "not-a-real-key")
    .send(req());
  assert.equal(await Notification.countDocuments({}), 0);
});

test("GET /demo/notifications lists what was sent, newest first", async () => {
  await post("/notification/send").send(req());
  await post("/notification/send").send(
    req({ requestId: "req-not-002", planId: "SMART-POSTPAID-10" })
  );

  const res = await supertest(app)
    .get("/demo/notifications")
    .set("x-api-key", (process.env.API_KEYS || "").split(",")[0]);

  assert.equal(res.status, 200);
  assert.equal(res.body.notifications.length, 2);
  const ids = res.body.notifications.map((n) => n.notificationId);
  assert.deepEqual(ids, [...ids].sort().reverse(), "newest first");
});

test("GET /demo/notifications requires the API key", async () => {
  const res = await supertest(app).get("/demo/notifications");
  assert.equal(res.status, 401);
});
