/**
 * Contract tests for POST /account/usage_history (Branch B).
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

before(() => setupDb("usage_history"));
beforeEach(async () => {
  await resetDb();
  // resetDb seeds only the Branch A example subscriber; give it usage history
  // plus a second, cause-not-identified subscriber for the escalation path.
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    {
      $set: {
        usageHistory: {
          cause: {
            identified: true,
            type: "DATA_USAGE",
            summary: "A 1850 MB streaming session ran overnight on 8 September.",
          },
          internetUsage: {
            totalUsedMB: 1850,
            records: [
              {
                startedAt: "20260908011200",
                endedAt: "20260908043700",
                usedMB: 1850,
                network: "4G",
                category: "STREAMING",
              },
            ],
          },
          vasDeductions: { totalAmount: 0, currency: "USD", records: [] },
        },
      },
    }
  );
  await Subscriber.create({
    msisdn: "85510777222",
    name: "Kim Veasna",
    type: "PREPAID",
    balance: { main: { amount: 0, currency: "USD", expiry: "20260912" }, bonus: null },
    data: { allowanceMB: 2048, usedMB: 2048, remainingMB: 0, expiry: "20260912" },
    usageHistory: {
      cause: { identified: false, type: "NONE", summary: "Nothing explains it." },
      internetUsage: { totalUsedMB: 0, records: [] },
      vasDeductions: { totalAmount: 0, currency: "USD", records: [] },
    },
  });
});
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-usg-001",
  timestamp: "20260909120000",
  msisdn: "85510234567",
  ...overrides,
});

test("SUCCESS with a cause — envelope + payload key order", async () => {
  const res = await post("/account/usage_history").send(req());

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "window",
    "cause",
    "internetUsage",
    "vasDeductions",
  ]);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-usg-001");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(Object.keys(res.body.subscriber), ["msisdn", "name", "type"]);
  assert.deepEqual(Object.keys(res.body.window), ["fromDate", "toDate"]);
  assert.deepEqual(Object.keys(res.body.cause), ["identified", "type", "summary"]);
  assert.equal(res.body.cause.identified, true);
  assert.equal(res.body.cause.type, "DATA_USAGE");

  const rec = res.body.internetUsage.records[0];
  assert.deepEqual(Object.keys(rec), [
    "startedAt",
    "endedAt",
    "usedMB",
    "network",
    "category",
  ]);
});

test("window defaults are applied and echoed", async () => {
  const res = await post("/account/usage_history").send(req());
  assert.match(res.body.window.fromDate, DATE);
  assert.match(res.body.window.toDate, DATE);
});

test("an explicit window is echoed back", async () => {
  const res = await post("/account/usage_history").send(
    req({ fromDate: "20260820", toDate: "20260909" })
  );
  assert.deepEqual(res.body.window, { fromDate: "20260820", toDate: "20260909" });
});

test("cause not identified is a SUCCESS (escalation path)", async () => {
  const res = await post("/account/usage_history").send(
    req({ msisdn: "85510777222" })
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.cause.identified, false);
  assert.equal(res.body.cause.type, "NONE");
  assert.deepEqual(res.body.internetUsage.records, []);
});

test("a subscriber with no usageHistory answers cause-not-identified", async () => {
  await Subscriber.create({
    msisdn: "9800001111",
    name: "Curl Added",
    type: "PREPAID",
    balance: { main: { amount: 5, currency: "USD", expiry: "20261101" }, bonus: null },
    data: { allowanceMB: 10240, usedMB: 0, remainingMB: 10240, expiry: "20261101" },
  });

  const res = await post("/account/usage_history").send(
    req({ msisdn: "9800001111" })
  );
  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.cause.identified, false);
});

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/account/usage_history").send(
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
  assert.equal(res.body.error.code, "404");
});

test("fromDate after toDate is a 422", async () => {
  const res = await post("/account/usage_history").send(
    req({ fromDate: "20260909", toDate: "20260901" })
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
});

test("a window longer than 60 days is a 422", async () => {
  const res = await post("/account/usage_history").send(
    req({ fromDate: "20260101", toDate: "20260909" })
  );
  assert.equal(res.body.error.code, "422");
});

test("a malformed date is a 400", async () => {
  const res = await post("/account/usage_history").send(
    req({ fromDate: "2026-08-10" })
  );
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
});

test("forced-error msisdn returns a 500", async () => {
  const res = await post("/account/usage_history").send(
    req({ msisdn: "85510999500" })
  );
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
});

test("country-code tolerant lookup works here too", async () => {
  await Subscriber.create({
    msisdn: "919899047146",
    name: "Ravinder Malhotra",
    type: "POSTPAID",
    balance: { main: { amount: 15, currency: "USD", expiry: "20261130" }, bonus: null },
    data: { allowanceMB: 51200, usedMB: 20480, remainingMB: 30720, expiry: "20261015" },
    usageHistory: {
      cause: { identified: true, type: "MIXED", summary: "Streaming plus a VAS renewal." },
      internetUsage: { totalUsedMB: 3200, records: [] },
      vasDeductions: { totalAmount: 1.49, currency: "USD", records: [] },
    },
  });

  const res = await post("/account/usage_history").send(req({ msisdn: "9899047146" }));
  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.subscriber.name, "Ravinder Malhotra");
});

test("requires the API key", async () => {
  const res = await supertest(app)
    .post("/account/usage_history")
    .send(req());
  assert.equal(res.status, 401);
});
