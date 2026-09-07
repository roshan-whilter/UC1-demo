/**
 * Contract tests for POST /account/balance_usage.
 *
 * These assert the spec's response shape down to key order — the agent's
 * prompt reads these fields by name, so a renamed or reordered key is a defect.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  post,
  setupDb,
  resetDb,
  teardownDb,
  balanceRequest,
  SPEC_SUBSCRIBER,
} from "./helpers.js";

const TIMESTAMP = /^\d{14}$/;

before(() => setupDb("balance_usage"));
beforeEach(resetDb);
after(teardownDb);

test("SUCCESS body matches the spec example exactly", async () => {
  const res = await post("/account/balance_usage")
    .send(balanceRequest());

  assert.equal(res.status, 200, "every endpoint returns HTTP 200");

  // Envelope, in the spec's order.
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "balance",
    "data",
  ]);

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {}, "error is {} on success");
  assert.equal(res.body.requestId, "req-bal-001", "requestId is echoed");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(Object.keys(res.body.subscriber), [
    "msisdn",
    "name",
    "type",
  ]);
  assert.deepEqual(res.body.subscriber, {
    msisdn: SPEC_SUBSCRIBER.msisdn,
    name: SPEC_SUBSCRIBER.name,
    type: SPEC_SUBSCRIBER.type,
  });

  assert.deepEqual(Object.keys(res.body.balance), ["main", "bonus"]);
  assert.deepEqual(Object.keys(res.body.balance.main), [
    "amount",
    "currency",
    "expiry",
  ]);
  assert.deepEqual(res.body.balance.main, {
    amount: 2.75,
    currency: "USD",
    expiry: "20261005",
  });
  assert.deepEqual(res.body.balance.bonus, {
    amount: 0.5,
    currency: "USD",
    expiry: "20260915",
  });

  assert.deepEqual(Object.keys(res.body.data), [
    "allowanceMB",
    "usedMB",
    "remainingMB",
    "expiry",
  ]);
  assert.deepEqual(res.body.data, {
    allowanceMB: 10240,
    usedMB: 7680,
    remainingMB: 2560,
    expiry: "20260930",
  });
});

test("bonus may be null", async () => {
  const { Subscriber } = await import("../src/models/Subscriber.js");
  await Subscriber.create({
    msisdn: "85510555111",
    name: "Chan Sophea",
    type: "POSTPAID",
    balance: {
      main: { amount: 12.4, currency: "USD", expiry: "20261130" },
      bonus: null,
    },
    data: {
      allowanceMB: 51200,
      usedMB: 48000,
      remainingMB: 3200,
      expiry: "20260930",
    },
  });

  const res = await post("/account/balance_usage")
    .send(balanceRequest({ msisdn: "85510555111" }));

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.balance.bonus, null);
  assert.equal(res.body.subscriber.type, "POSTPAID");
});

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/account/balance_usage")
    .send(balanceRequest({ msisdn: "85510000000" }));

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "msisdn",
  ]);
  assert.equal(res.body.status, "FAILURE");
  assert.deepEqual(res.body.error, {
    code: "404",
    message: "Subscriber not found",
  });
  assert.equal(res.body.requestId, "req-bal-001");
  assert.match(res.body.timestamp, TIMESTAMP);
  assert.equal(res.body.msisdn, "85510000000", "failure echoes the msisdn sent");
});

test("error.code is a string, not a number", async () => {
  const res = await post("/account/balance_usage")
    .send(balanceRequest({ msisdn: "85510000000" }));

  assert.equal(typeof res.body.error.code, "string");
});

for (const [label, body] of [
  ["missing requestId", balanceRequest({ requestId: undefined })],
  ["missing timestamp", balanceRequest({ timestamp: undefined })],
  ["missing msisdn", balanceRequest({ msisdn: undefined })],
  ["empty msisdn", balanceRequest({ msisdn: "" })],
  ["non-string requestId", balanceRequest({ requestId: 12345 })],
  ["short timestamp", balanceRequest({ timestamp: "202609071200" })],
  ["non-numeric timestamp", balanceRequest({ timestamp: "2026-09-07T12:00" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/account/balance_usage").send(body);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
    assert.match(res.body.error.message, /^Malformed request: /);
  });
}

test("forced-failure msisdn returns a 500 FAILURE", async () => {
  const res = await post("/account/balance_usage")
    .send(balanceRequest({ msisdn: "85510999500" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
  assert.equal(res.body.msisdn, "85510999500");
});

test("unparseable JSON body is a 400 FAILURE, still HTTP 200", async () => {
  const res = await post("/account/balance_usage")
    .set("Content-Type", "application/json")
    .send('{"requestId": "req-bal-001",');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
  assert.equal(res.body.requestId, null, "nothing was received to echo");
});

test("wrong Content-Type is a 400 FAILURE", async () => {
  const res = await post("/account/balance_usage")
    .set("Content-Type", "text/plain")
    .send("requestId=req-bal-001");

  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "400");
});

test("msisdn with separators resolves to the same subscriber", async () => {
  const res = await post("/account/balance_usage")
    .send(balanceRequest({ msisdn: "+855 10 234 567" }));

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(
    res.body.subscriber.msisdn,
    "85510234567",
    "the canonical stored number is returned"
  );
});
