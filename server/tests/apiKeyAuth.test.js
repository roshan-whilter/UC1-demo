/**
 * Auth is mandatory on both documented endpoints and on the /demo data
 * helpers. Only /demo/health is reachable without a key.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import supertest from "supertest";
import {
  app,
  post,
  rawPost,
  setupDb,
  resetDb,
  teardownDb,
  balanceRequest,
  ticketRequest,
  TEST_API_KEY,
} from "./helpers.js";

before(() => setupDb("api_key_auth"));
beforeEach(resetDb);
after(teardownDb);

const CASES = [
  ["/account/balance_usage", balanceRequest],
  ["/ticket/create", ticketRequest],
];

for (const [path, build] of CASES) {
  test(`${path}: no key is a 401`, async () => {
    const res = await rawPost(path).send(build());

    assert.equal(res.status, 401);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "401");
    assert.match(res.body.error.message, /Missing x-api-key header/);
  });

  test(`${path}: wrong key is a 401`, async () => {
    const res = await rawPost(path)
      .set("x-api-key", "uc1_definitely-not-the-key")
      .send(build());

    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, "401");
    assert.match(res.body.error.message, /Invalid API key/);
  });

  test(`${path}: correct key is accepted`, async () => {
    const res = await post(path).send(build());

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "SUCCESS");
  });

  test(`${path}: the 401 body is the spec's FAILURE envelope`, async () => {
    const res = await rawPost(path).send(build());

    assert.deepEqual(Object.keys(res.body), [
      "status",
      "error",
      "requestId",
      "timestamp",
      "msisdn",
    ]);
  });

  test(`${path}: a 401 advertises the scheme`, async () => {
    const res = await rawPost(path).send(build());
    assert.match(res.headers["www-authenticate"], /^ApiKey /);
  });
}

test("an unauthorised caller is not told their JSON was malformed", async () => {
  const res = await rawPost("/account/balance_usage")
    .set("Content-Type", "application/json")
    .send('{"requestId": "req-bal-001",');

  assert.equal(res.status, 401, "auth is checked before the body is reported on");
  assert.equal(res.body.error.code, "401");
});

test("a key is not accepted from the query string or body", async () => {
  const res = await rawPost(
    `/account/balance_usage?x-api-key=${TEST_API_KEY}`
  ).send({ ...balanceRequest(), apiKey: TEST_API_KEY });

  assert.equal(res.status, 401, "the header is the only accepted channel");
});

test("/demo/health needs no key", async () => {
  const res = await supertest(app).get("/demo/health");

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "UP");
});

test("/demo/health leaks no configuration", async () => {
  const res = await supertest(app).get("/demo/health");

  assert.equal(res.body.forcedFailureMsisdns, undefined);
  assert.equal(res.body.apiKeys, undefined);
});

for (const path of ["/demo/subscribers", "/demo/tickets"]) {
  test(`GET ${path}: no key is a 401`, async () => {
    const res = await supertest(app).get(path);
    assert.equal(res.status, 401);
  });

  test(`GET ${path}: correct key is accepted`, async () => {
    const res = await supertest(app).get(path).set("x-api-key", TEST_API_KEY);
    assert.equal(res.status, 200);
  });
}

test("a second configured key also works", async () => {
  // The middleware reads config.apiKeys, which the test script seeds with two
  // values — one per teammate is the intended usage.
  const second = (process.env.API_KEYS || "").split(",")[1];
  assert.ok(second, "the test run should configure two keys");

  const res = await rawPost("/account/balance_usage")
    .set("x-api-key", second)
    .send(balanceRequest());

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
});
