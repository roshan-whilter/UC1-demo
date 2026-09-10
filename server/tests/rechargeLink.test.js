/**
 * Contract tests for POST /recharge/send_link (UC2 Branch A).
 *
 * This is the project's first ACTION endpoint, so alongside the usual envelope
 * assertions these check the side effect: what got persisted, the id sequence,
 * resend counting, and that a failure records nothing.
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
import { RechargeLink } from "../src/models/RechargeLink.js";

const TIMESTAMP = /^\d{14}$/;
const REFERENCE = /^RCG-\d{8}-\d{4}$/;
const MESSAGE_ID = /^SMS-\d{8}-\d{4}$/;

before(() => setupDb("recharge_link"));
beforeEach(async () => {
  await resetDb();
  await Subscriber.create({
    msisdn: "85510555111",
    name: "Chan Sophea",
    type: "POSTPAID",
    balance: { main: { amount: 12.4, currency: "USD", expiry: "20261130" }, bonus: null },
    data: { allowanceMB: 51200, usedMB: 48000, remainingMB: 3200, expiry: "20260930" },
  });
});
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-rcg-001",
  timestamp: "20260910120000",
  msisdn: "85510234567",
  ...overrides,
});

test("SUCCESS body matches the spec example shape and key order", async () => {
  const res = await post("/recharge/send_link").send(req({ amount: 5.0 }));

  assert.equal(res.status, 200, "every endpoint returns HTTP 200");
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "message",
    "link",
  ]);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-rcg-001");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(Object.keys(res.body.subscriber), ["msisdn", "name", "type"]);
  assert.deepEqual(Object.keys(res.body.message), [
    "messageId",
    "channel",
    "to",
    "status",
    "sentAt",
    "resendCount",
  ]);
  assert.deepEqual(Object.keys(res.body.link), [
    "reference",
    "url",
    "amount",
    "currency",
    "expiresAt",
  ]);
});

test("message and link fields carry the documented values", async () => {
  const res = await post("/recharge/send_link").send(req({ amount: 5.0 }));
  const { message, link } = res.body;

  assert.match(message.messageId, MESSAGE_ID);
  assert.equal(message.channel, "SMS");
  assert.equal(message.to, "85510234567", "the SMS goes to the subscriber");
  assert.equal(message.status, "SENT");
  assert.match(message.sentAt, TIMESTAMP);
  assert.equal(message.resendCount, 0, "first send of the day");

  assert.match(link.reference, REFERENCE);
  assert.equal(link.amount, 5.0);
  assert.equal(link.currency, "USD");
  assert.match(link.expiresAt, TIMESTAMP);
});

test("messageId and link.reference share one sequence number", async () => {
  const res = await post("/recharge/send_link").send(req({ amount: 5.0 }));
  const { messageId } = res.body.message;
  const { reference } = res.body.link;

  assert.equal(
    messageId.replace(/^SMS-/, ""),
    reference.replace(/^RCG-/, ""),
    "SMS-…-0001 and RCG-…-0001 must refer to the same send"
  );
});

test("the deep-link carries the reference, and the amount when given", async () => {
  const res = await post("/recharge/send_link").send(req({ amount: 5.0 }));
  const { url, reference } = res.body.link;

  assert.ok(url.includes(`ref=${reference}`), "url carries the reference");
  assert.ok(url.includes("amount=5.00"), "amount is formatted to 2 decimals");
});

test("omitting amount gives a generic link — still a SUCCESS", async () => {
  const res = await post("/recharge/send_link").send(
    req({ msisdn: "85510555111" })
  );

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.link.amount, null, "amount is null, not absent");
  assert.ok(
    !res.body.link.url.includes("amount="),
    "no amount parameter on a generic link"
  );
  assert.equal(res.body.link.currency, "USD");
});

test("the link expires 24 hours after it was sent", async () => {
  const res = await post("/recharge/send_link").send(req());
  const { sentAt } = res.body.message;
  const { expiresAt } = res.body.link;

  const parse = (t) =>
    Date.UTC(
      +t.slice(0, 4),
      +t.slice(4, 6) - 1,
      +t.slice(6, 8),
      +t.slice(8, 10),
      +t.slice(10, 12),
      +t.slice(12, 14)
    );
  assert.equal((parse(expiresAt) - parse(sentAt)) / 3600000, 24);
});

test("the send is persisted with everything needed to trace it", async () => {
  const res = await post("/recharge/send_link").send(req({ amount: 7.5 }));

  const stored = await RechargeLink.findOne({
    reference: res.body.link.reference,
  }).lean();

  assert.ok(stored, "the send was recorded");
  assert.equal(stored.messageId, res.body.message.messageId);
  assert.equal(stored.msisdn, "85510234567");
  assert.equal(stored.to, "85510234567");
  assert.equal(stored.amount, 7.5);
  assert.equal(stored.channel, "SMS");
  assert.equal(stored.status, "SENT");
  assert.equal(stored.requestId, "req-rcg-001");
  assert.equal(stored.day, stored.sentAt.slice(0, 8));
});

test("resendCount rises per subscriber per day, and is not shared between numbers", async () => {
  const a1 = await post("/recharge/send_link").send(req());
  const a2 = await post("/recharge/send_link").send(req());
  const a3 = await post("/recharge/send_link").send(req());
  assert.deepEqual(
    [a1, a2, a3].map((r) => r.body.message.resendCount),
    [0, 1, 2]
  );

  // A different subscriber starts from zero again.
  const b1 = await post("/recharge/send_link").send(
    req({ msisdn: "85510555111" })
  );
  assert.equal(b1.body.message.resendCount, 0);
});

test("the daily sequence increments and never collides", async () => {
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      post("/recharge/send_link").send(req({ requestId: `req-rcg-${i}` }))
    )
  );

  const refs = responses.map((r) => r.body.link.reference);
  assert.equal(new Set(refs).size, 8, "all references distinct");
  const ids = responses.map((r) => r.body.message.messageId);
  assert.equal(new Set(ids).size, 8, "all messageIds distinct");
});

test("country-code tolerant lookup, and the SMS goes to the canonical number", async () => {
  await Subscriber.create({
    msisdn: "919899047146",
    name: "Ravinder Malhotra",
    type: "POSTPAID",
    balance: { main: { amount: 15.75, currency: "USD", expiry: "20261130" }, bonus: null },
    data: { allowanceMB: 51200, usedMB: 20480, remainingMB: 30720, expiry: "20261015" },
  });

  for (const dialled of ["919899047146", "+919899047146", "9899047146"]) {
    const res = await post("/recharge/send_link").send(req({ msisdn: dialled }));
    assert.equal(res.body.status, "SUCCESS", `${dialled} should resolve`);
    assert.equal(res.body.subscriber.name, "Ravinder Malhotra");
    assert.equal(
      res.body.message.to,
      "919899047146",
      "the SMS goes to the canonical stored number, not the raw input"
    );
  }
});

// --- failures ---------------------------------------------------------------

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/recharge/send_link").send(
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
  assert.equal(res.body.msisdn, "85510000000");
});

for (const [label, amount] of [
  ["zero", 0],
  ["negative", -5],
  ["above the ceiling", 100000],
]) {
  test(`422 FAILURE: amount ${label}`, async () => {
    const res = await post("/recharge/send_link").send(req({ amount }));

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "422");
    assert.match(res.body.error.message, /^Invalid amount: /);
  });
}

test("a 422 records no send — nothing was dispatched", async () => {
  await post("/recharge/send_link").send(req({ amount: -1 }));
  assert.equal(await RechargeLink.countDocuments({}), 0);
});

test("a non-numeric amount is a 400, not a 422", async () => {
  const res = await post("/recharge/send_link").send(req({ amount: "five" }));

  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
  assert.match(res.body.error.message, /amount must be a number/);
});

test("forced-failure msisdn returns a 500 (gateway down)", async () => {
  const res = await post("/recharge/send_link").send(
    req({ msisdn: "85510999500" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
  assert.equal(res.body.msisdn, "85510999500");
});

test("a 500 records no send — the agent must not claim an SMS went out", async () => {
  await post("/recharge/send_link").send(req({ msisdn: "85510999500" }));
  assert.equal(await RechargeLink.countDocuments({}), 0);
});

for (const [label, body] of [
  ["missing requestId", req({ requestId: undefined })],
  ["missing timestamp", req({ timestamp: undefined })],
  ["missing msisdn", req({ msisdn: undefined })],
  ["empty msisdn", req({ msisdn: "" })],
  ["short timestamp", req({ timestamp: "202609101200" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/recharge/send_link").send(body);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
  });
}

test("unparseable JSON body is a 400 FAILURE, still HTTP 200", async () => {
  const res = await post("/recharge/send_link")
    .set("Content-Type", "application/json")
    .send('{"requestId": "req-rcg-001",');

  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "400");
});

test("wrong Content-Type is a 400 FAILURE", async () => {
  const res = await post("/recharge/send_link")
    .set("Content-Type", "text/plain")
    .send("requestId=req-rcg-001");

  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "400");
});

test("requires the API key", async () => {
  const res = await supertest(app).post("/recharge/send_link").send(req());
  assert.equal(res.status, 401);
});

// --- the console helper -----------------------------------------------------

test("GET /demo/recharge_links lists what was sent, newest first", async () => {
  await post("/recharge/send_link").send(req({ amount: 1 }));
  await post("/recharge/send_link").send(req({ amount: 2 }));

  const res = await supertest(app)
    .get("/demo/recharge_links")
    .set("x-api-key", TEST_API_KEY);

  assert.equal(res.status, 200);
  assert.equal(res.body.rechargeLinks.length, 2);
  const refs = res.body.rechargeLinks.map((l) => l.reference);
  assert.deepEqual(refs, [...refs].sort().reverse(), "newest first");
});

test("GET /demo/recharge_links requires the API key", async () => {
  const res = await supertest(app).get("/demo/recharge_links");
  assert.equal(res.status, 401);
});

// --- the shared ticket endpoint, UC2 Branch A variant -----------------------

test("ticket/create takes the UC2 Branch A values unchanged", async () => {
  const res = await post("/ticket/create").send({
    requestId: "req-tkt-uc2a",
    timestamp: "20260910120130",
    msisdn: "85510234567",
    type: "ENQUIRY",
    category: "NEW_ENQUIRY_PREHANDLED",
    summary:
      "Customer asked how to recharge. Walked through the steps and sent an SMS deep-link; customer satisfied.",
    callbackNumber: "85510234567",
  });

  assert.equal(res.body.status, "SUCCESS");
  assert.match(res.body.ticket.ticketId, /^TKT-\d{8}-\d{4}$/);
});
