/**
 * Contract tests for POST /recharge/details (UC2 Branch B).
 *
 * The pivotal assertion is `match.confirmed`: it must be true ONLY for a
 * matching, successfully credited top-up. Anything else and the agent would
 * tell a caller their money arrived when it didn't.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import {
  app,
  post,
  setupDb,
  resetDb,
  teardownDb,
  TEST_API_KEY,
} from "./helpers.js";
import { Subscriber } from "../src/models/Subscriber.js";

const TIMESTAMP = /^\d{14}$/;
const DATE = /^\d{8}$/;

/** Dates relative to today, so the 30-day window never ages out. */
const pad = (n) => String(n).padStart(2, "0");
const dayOffset = (days) => {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
};
const TODAY = dayOffset(0);
const YESTERDAY = dayOffset(-1);
const THREE_DAYS_AGO = dayOffset(-3);

const rec = (over = {}) => ({
  rechargeId: "RCH-TEST-0001",
  rechargedAt: `${YESTERDAY}142200`,
  amount: 5.0,
  currency: "USD",
  channel: "APP",
  status: "CREDITED",
  creditedAt: `${YESTERDAY}142205`,
  reference: "SMART-TXN-1",
  ...over,
});

before(() => setupDb("recharge_details"));
beforeEach(async () => {
  await resetDb();
  // The spec subscriber gets one credited top-up yesterday for 5.00.
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    { $set: { rechargeHistory: [rec()] } }
  );
});
after(teardownDb);

const req = (over = {}) => ({
  requestId: "req-rcd-001",
  timestamp: "20260911120000",
  msisdn: "85510234567",
  ...over,
});

/** Give the spec subscriber an arbitrary history. */
const withHistory = (records) =>
  Subscriber.updateOne({ msisdn: "85510234567" }, { $set: { rechargeHistory: records } });

test("SUCCESS body key order follows the spec", async () => {
  const res = await post("/recharge/details").send(
    req({ date: YESTERDAY, amount: 5.0 })
  );

  assert.equal(res.status, 200, "every endpoint returns HTTP 200");
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "claim",
    "match",
    "recharges",
  ]);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-rcd-001");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(Object.keys(res.body.subscriber), ["msisdn", "name", "type"]);
  assert.deepEqual(Object.keys(res.body.claim), ["date", "amount", "currency"]);
  assert.deepEqual(Object.keys(res.body.match), [
    "confirmed",
    "status",
    "rechargeId",
    "summary",
  ]);
  assert.deepEqual(Object.keys(res.body.recharges), [
    "window",
    "totalAmount",
    "currency",
    "records",
  ]);
  assert.deepEqual(Object.keys(res.body.recharges.window), ["fromDate", "toDate"]);
  assert.deepEqual(Object.keys(res.body.recharges.records[0]), [
    "rechargeId",
    "rechargedAt",
    "amount",
    "currency",
    "channel",
    "status",
    "creditedAt",
    "reference",
  ]);
});

test("a matching credited top-up is CONFIRMED", async () => {
  const res = await post("/recharge/details").send(
    req({ date: YESTERDAY, amount: 5.0 })
  );

  assert.equal(res.body.match.confirmed, true);
  assert.equal(res.body.match.status, "CREDITED");
  assert.equal(res.body.match.rechargeId, "RCH-TEST-0001");
  assert.match(res.body.match.summary, /credited successfully/);
  assert.match(res.body.match.summary, /refreshing the app/);
});

test("the claim is echoed back, and is null when not given", async () => {
  const both = await post("/recharge/details").send(
    req({ date: YESTERDAY, amount: 5.0 })
  );
  assert.deepEqual(both.body.claim, {
    date: YESTERDAY,
    amount: 5.0,
    currency: "USD",
  });

  const neither = await post("/recharge/details").send(req());
  assert.deepEqual(neither.body.claim, {
    date: null,
    amount: null,
    currency: "USD",
  });
});

test("the window is the last 30 days and is echoed", async () => {
  const res = await post("/recharge/details").send(req());
  assert.match(res.body.recharges.window.fromDate, DATE);
  assert.equal(res.body.recharges.window.toDate, TODAY);
  assert.equal(res.body.recharges.window.fromDate, dayOffset(-30));
});

// --- every non-confirmed status ---------------------------------------------

for (const [status, matcher] of [
  ["FAILED", /payment failed/],
  ["PENDING", /still processing/],
  ["REVERSED", /reversed/],
]) {
  test(`${status} is a SUCCESS but NOT confirmed`, async () => {
    await withHistory([rec({ status, creditedAt: status === "REVERSED" ? `${YESTERDAY}142205` : null })]);

    const res = await post("/recharge/details").send(
      req({ date: YESTERDAY, amount: 5.0 })
    );

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "SUCCESS", "the lookup worked");
    assert.equal(res.body.match.confirmed, false, "must NOT be confirmed");
    assert.equal(res.body.match.status, status);
    assert.equal(res.body.match.rechargeId, "RCH-TEST-0001", "the record is still named");
    assert.match(res.body.match.summary, matcher);
  });
}

test("no matching top-up is NOT_FOUND with a null rechargeId", async () => {
  const res = await post("/recharge/details").send(
    req({ date: THREE_DAYS_AGO, amount: 99.0 })
  );

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.match.confirmed, false);
  assert.equal(res.body.match.status, "NOT_FOUND");
  assert.equal(res.body.match.rechargeId, null);
  assert.match(res.body.match.summary, /No top-up/);
});

test("an account with no top-ups at all says so", async () => {
  await withHistory([]);

  const res = await post("/recharge/details").send(
    req({ date: YESTERDAY, amount: 5.0 })
  );

  assert.equal(res.body.match.status, "NOT_FOUND");
  assert.match(res.body.match.summary, /No top-ups were found on this account/);
  assert.deepEqual(res.body.recharges.records, []);
  assert.equal(res.body.recharges.totalAmount, 0);
});

test("giving neither date nor amount returns the history and says why", async () => {
  const res = await post("/recharge/details").send(req());

  assert.equal(res.body.status, "SUCCESS", "not an error — a real conversation");
  assert.equal(res.body.match.confirmed, false);
  assert.equal(res.body.match.status, "NOT_FOUND");
  assert.match(res.body.match.summary, /No date or amount was given/);
  assert.equal(
    res.body.recharges.records.length,
    1,
    "the agent can still read the history out"
  );
});

// --- matching rules ---------------------------------------------------------

test("date alone matches", async () => {
  const res = await post("/recharge/details").send(req({ date: YESTERDAY }));
  assert.equal(res.body.match.confirmed, true);
});

test("amount alone matches", async () => {
  const res = await post("/recharge/details").send(req({ amount: 5.0 }));
  assert.equal(res.body.match.confirmed, true);
});

test("a wrong amount on the right date does not match", async () => {
  const res = await post("/recharge/details").send(
    req({ date: YESTERDAY, amount: 7.0 })
  );
  assert.equal(res.body.match.status, "NOT_FOUND");
});

test("a credited record wins over a failed one on the same day and amount", async () => {
  // If the money did arrive, that is the honest answer — even though an earlier
  // attempt failed.
  await withHistory([
    rec({ rechargeId: "RCH-FAILED", rechargedAt: `${YESTERDAY}090000`, status: "FAILED", creditedAt: null, reference: "T-F" }),
    rec({ rechargeId: "RCH-OK", rechargedAt: `${YESTERDAY}142200`, status: "CREDITED", reference: "T-C" }),
  ]);

  const res = await post("/recharge/details").send(
    req({ date: YESTERDAY, amount: 5.0 })
  );

  assert.equal(res.body.match.confirmed, true);
  assert.equal(res.body.match.rechargeId, "RCH-OK");
});

// --- the records list -------------------------------------------------------

test("records come back newest first", async () => {
  await withHistory([
    rec({ rechargeId: "RCH-OLD", rechargedAt: `${THREE_DAYS_AGO}080000`, reference: "T-1" }),
    rec({ rechargeId: "RCH-NEW", rechargedAt: `${YESTERDAY}142200`, reference: "T-2" }),
  ]);

  const res = await post("/recharge/details").send(req());
  assert.deepEqual(
    res.body.recharges.records.map((r) => r.rechargeId),
    ["RCH-NEW", "RCH-OLD"]
  );
});

test("totalAmount counts only credited top-ups", async () => {
  await withHistory([
    rec({ rechargeId: "A", amount: 5.0, status: "CREDITED", reference: "T-1" }),
    rec({ rechargeId: "B", amount: 10.0, status: "FAILED", creditedAt: null, reference: "T-2" }),
    rec({ rechargeId: "C", amount: 20.0, status: "REVERSED", reference: "T-3" }),
    rec({ rechargeId: "D", amount: 3.0, status: "CREDITED", reference: "T-4" }),
  ]);

  const res = await post("/recharge/details").send(req());
  assert.equal(res.body.recharges.totalAmount, 8.0, "5 + 3, not 38");
});

test("creditedAt is null for anything not credited", async () => {
  await withHistory([rec({ status: "FAILED", creditedAt: null })]);
  const res = await post("/recharge/details").send(req());
  assert.equal(res.body.recharges.records[0].creditedAt, null);
});

// --- failures ---------------------------------------------------------------

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/recharge/details").send(
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
  assert.deepEqual(res.body.error, {
    code: "404",
    message: "Subscriber not found",
  });
});

test("a future date is a 422", async () => {
  const res = await post("/recharge/details").send(
    req({ date: dayOffset(3) })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
  assert.match(res.body.error.message, /in the future/);
});

test("a date older than the window is a 422", async () => {
  const res = await post("/recharge/details").send(
    req({ date: dayOffset(-45) })
  );

  assert.equal(res.body.error.code, "422");
  assert.match(res.body.error.message, /last 30 days/);
});

test("a non-positive claimed amount is a 422", async () => {
  for (const amount of [0, -5]) {
    const res = await post("/recharge/details").send(req({ amount }));
    assert.equal(res.body.error.code, "422", `amount ${amount}`);
    assert.match(res.body.error.message, /greater than zero/);
  }
});

test("a 422 is raised even for an unknown number — the claim is unusable either way", async () => {
  const res = await post("/recharge/details").send(
    req({ msisdn: "85510000000", date: dayOffset(5) })
  );
  assert.equal(res.body.error.code, "422");
});

for (const [label, body] of [
  ["missing requestId", req({ requestId: undefined })],
  ["missing timestamp", req({ timestamp: undefined })],
  ["missing msisdn", req({ msisdn: undefined })],
  ["malformed date", req({ date: "2026-09-10" })],
  ["non-numeric amount", req({ amount: "five" })],
  ["short timestamp", req({ timestamp: "202609111200" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/recharge/details").send(body);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
  });
}

test("forced-failure msisdn returns a 500", async () => {
  const res = await post("/recharge/details").send(
    req({ msisdn: "85510999500" })
  );

  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
});

test("unparseable JSON body is a 400 FAILURE, still HTTP 200", async () => {
  const res = await post("/recharge/details")
    .set("Content-Type", "application/json")
    .send('{"requestId": "req-rcd-001",');

  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "400");
});

test("wrong Content-Type is a 400 FAILURE", async () => {
  const res = await post("/recharge/details")
    .set("Content-Type", "text/plain")
    .send("requestId=req-rcd-001");

  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "400");
});

test("country-code tolerant lookup works here too", async () => {
  await Subscriber.create({
    msisdn: "919899047146",
    name: "Ravinder Malhotra",
    type: "POSTPAID",
    balance: { main: { amount: 15.75, currency: "USD", expiry: "20261130" }, bonus: null },
    data: { allowanceMB: 51200, usedMB: 20480, remainingMB: 30720, expiry: "20261015" },
    rechargeHistory: [rec({ rechargeId: "RCH-RM-1", reference: "T-RM" })],
  });

  for (const dialled of ["919899047146", "+919899047146", "9899047146"]) {
    const res = await post("/recharge/details").send(
      req({ msisdn: dialled, amount: 5.0 })
    );
    assert.equal(res.body.status, "SUCCESS", `${dialled} should resolve`);
    assert.equal(res.body.subscriber.name, "Ravinder Malhotra");
    assert.equal(res.body.match.confirmed, true);
  }
});

test("a subscriber added via the demo endpoint has no history", async () => {
  await supertest(app)
    .post("/demo/subscribers")
    .set("x-api-key", TEST_API_KEY)
    .send({ msisdn: "9800003333", name: "Curl Added" });

  const res = await post("/recharge/details").send(
    req({ msisdn: "9800003333", amount: 5.0 })
  );

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.match.status, "NOT_FOUND");
  assert.deepEqual(res.body.recharges.records, []);
});

test("requires the API key", async () => {
  const res = await supertest(app).post("/recharge/details").send(req());
  assert.equal(res.status, 401);
});

// --- the shared ticket endpoint, UC2 Branch B variant -----------------------

test("ticket/create takes the UC2 Branch B values unchanged", async () => {
  const res = await post("/ticket/create").send({
    requestId: "req-tkt-uc2b",
    timestamp: "20260911120130",
    msisdn: "85510234567",
    type: "COMPLAINT",
    category: "NEW_COMPLAINT",
    summary:
      "Customer reported a missing 5.00 USD top-up. Confirmed it was credited (RCH-TEST-0001) and asked them to refresh the app; customer satisfied.",
    callbackNumber: "85510234567",
  });

  assert.equal(res.body.status, "SUCCESS");
  assert.match(res.body.ticket.ticketId, /^TKT-\d{8}-\d{4}$/);
});
