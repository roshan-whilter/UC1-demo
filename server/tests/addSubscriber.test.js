/**
 * POST /demo/subscribers — the non-spec helper that lets testers add their own
 * numbers to a running instance — plus the country-code tolerance in the
 * lookup that makes those numbers resolve whichever way they are dialled.
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
  balanceRequest,
  TEST_API_KEY,
} from "./helpers.js";

before(() => setupDb("add_subscriber"));
beforeEach(resetDb);
after(teardownDb);

const add = (body) =>
  supertest(app)
    .post("/demo/subscribers")
    .set("x-api-key", TEST_API_KEY)
    .send(body);

const lookup = (msisdn) =>
  post("/account/balance_usage").send(balanceRequest({ msisdn }));

test("a two-field body is enough", async () => {
  const res = await add({ msisdn: "9654987095", name: "Guneet Gandhiok" });

  assert.equal(res.status, 201);
  assert.equal(res.body.subscriber.name, "Guneet Gandhiok");
  assert.equal(res.body.subscriber.type, "PREPAID", "defaults to PREPAID");
  assert.equal(res.body.subscriber.balance.bonus, null);
  assert.match(res.body.subscriber.balance.main.expiry, /^\d{8}$/);
});

test("an added subscriber is immediately readable through the spec endpoint", async () => {
  await add({
    msisdn: "9654987095",
    name: "Guneet Gandhiok",
    balance: { main: { amount: 5, currency: "USD", expiry: "20261005" } },
    data: { allowanceMB: 10240, usedMB: 4096, expiry: "20260930" },
  });

  const res = await lookup("9654987095");

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.subscriber, {
    msisdn: "9654987095",
    name: "Guneet Gandhiok",
    type: "PREPAID",
  });
  assert.deepEqual(res.body.balance.main, {
    amount: 5,
    currency: "USD",
    expiry: "20261005",
  });
  assert.equal(res.body.data.remainingMB, 6144, "derived from allowance - used");
});

test("remainingMB is derived when omitted", async () => {
  const res = await add({
    msisdn: "9111111111",
    name: "Derived",
    data: { allowanceMB: 5000, usedMB: 1500 },
  });

  assert.equal(res.body.subscriber.data.remainingMB, 3500);
});

test("an explicit remainingMB is respected", async () => {
  const res = await add({
    msisdn: "9111111112",
    name: "Explicit",
    data: { allowanceMB: 5000, usedMB: 1500, remainingMB: 99 },
  });

  assert.equal(res.body.subscriber.data.remainingMB, 99);
});

test("adding the same number twice updates rather than duplicating", async () => {
  await add({ msisdn: "9654987095", name: "First Name" });
  const second = await add({ msisdn: "9654987095", name: "Second Name" });

  assert.equal(second.status, 200, "200 on update, 201 on create");
  assert.equal(second.body.subscriber.name, "Second Name");

  const listed = await supertest(app)
    .get("/demo/subscribers")
    .set("x-api-key", TEST_API_KEY);
  const matches = listed.body.subscribers.filter(
    (s) => s.msisdn === "9654987095"
  );
  assert.equal(matches.length, 1, "no duplicate record");
});

test("the number is stored digits-only, however it was written", async () => {
  const res = await add({ msisdn: "+91 98990 47146", name: "Ravinder Malhotra" });

  assert.equal(res.body.subscriber.msisdn, "919899047146");
});

test("a POSTPAID subscriber with a bonus wallet", async () => {
  const res = await add({
    msisdn: "9870566624",
    name: "Raghav Kumaria",
    type: "POSTPAID",
    balance: {
      main: { amount: 8.2, currency: "USD", expiry: "20261020" },
      bonus: { amount: 1.5, currency: "USD", expiry: "20260925" },
    },
  });

  assert.equal(res.body.subscriber.type, "POSTPAID");
  assert.deepEqual(res.body.subscriber.balance.bonus, {
    amount: 1.5,
    currency: "USD",
    expiry: "20260925",
  });
});

for (const [label, body, expected] of [
  ["missing msisdn", { name: "No Number" }, /msisdn is required/],
  ["short msisdn", { msisdn: "123", name: "Short" }, /at least 6 digits/],
  ["missing name", { msisdn: "9654987095" }, /name is required/],
  ["blank name", { msisdn: "9654987095", name: "   " }, /name is required/],
  [
    "bad type",
    { msisdn: "9654987095", name: "X", type: "GOLD" },
    /PREPAID or POSTPAID/,
  ],
  [
    "negative amount",
    { msisdn: "9654987095", name: "X", balance: { main: { amount: -5 } } },
    /non-negative/,
  ],
  [
    "bad expiry format",
    {
      msisdn: "9654987095",
      name: "X",
      data: { allowanceMB: 100, usedMB: 0, expiry: "2026-09-30" },
    },
    /8 digits, yyyyMMdd/,
  ],
  [
    "used exceeds allowance",
    { msisdn: "9654987095", name: "X", data: { allowanceMB: 100, usedMB: 200 } },
    /cannot exceed/,
  ],
]) {
  test(`400: ${label}`, async () => {
    const res = await add(body);
    assert.equal(res.status, 400);
    assert.match(res.body.message, expected);
  });
}

test("adding requires the API key", async () => {
  const res = await supertest(app)
    .post("/demo/subscribers")
    .send({ msisdn: "9654987095", name: "Guneet Gandhiok" });

  assert.equal(res.status, 401);
});

// --- country-code tolerance -------------------------------------------------
//
// The team supplied their numbers inconsistently — two bare 10-digit, one with
// +91 — so a number added one way has to resolve when dialled the other.

test("a number stored WITHOUT the country code resolves when dialled WITH it", async () => {
  await add({ msisdn: "9654987095", name: "Guneet Gandhiok" });

  for (const dialled of [
    "9654987095",
    "919654987095",
    "+919654987095",
    "+91 96549 87095",
  ]) {
    const res = await lookup(dialled);
    assert.equal(
      res.body.status,
      "SUCCESS",
      `${dialled} should resolve to Guneet Gandhiok`
    );
    assert.equal(res.body.subscriber.name, "Guneet Gandhiok");
  }
});

test("a number stored WITH the country code resolves when dialled WITHOUT it", async () => {
  await add({ msisdn: "+919899047146", name: "Ravinder Malhotra" });

  for (const dialled of ["919899047146", "+919899047146", "9899047146"]) {
    const res = await lookup(dialled);
    assert.equal(
      res.body.status,
      "SUCCESS",
      `${dialled} should resolve to Ravinder Malhotra`
    );
    assert.equal(res.body.subscriber.name, "Ravinder Malhotra");
  }
});

test("an ambiguous suffix resolves to nobody rather than the wrong account", async () => {
  // Two records sharing the same last 10 digits: the suffix fallback must
  // refuse to guess.
  await add({ msisdn: "919999900000", name: "Person A" });
  await add({ msisdn: "929999900000", name: "Person B" });

  const res = await lookup("9999900000");

  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "404");
});

test("an unrelated number still 404s", async () => {
  await add({ msisdn: "9654987095", name: "Guneet Gandhiok" });

  const res = await lookup("9123456789");

  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "404");
});
