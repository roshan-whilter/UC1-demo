/**
 * Contract tests for POST /account/plan_details (Branch C).
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

/** The plan block from the Branch C spec example, field for field. */
const SPEC_PLAN = {
  planId: "SMART-COMBO-5",
  name: "Smart Combo 5",
  price: { amount: 5.0, currency: "USD", cycle: "MONTHLY" },
  activatedOn: "20260831",
  renewsOn: "20260930",
  inclusions: {
    dataMB: 10240,
    onNetMinutes: 300,
    offNetMinutes: 60,
    smsCount: 100,
  },
};

const SPEC_SERVICES = [
  {
    serviceId: "VAS-CALLERTUNE",
    name: "CallerTune",
    price: { amount: 0.5, currency: "USD", cycle: "MONTHLY" },
    activatedOn: "20260705",
    renewsOn: "20261005",
  },
  {
    serviceId: "VAS-NEWSALERTS",
    name: "NewsAlerts",
    price: { amount: 0.25, currency: "USD", cycle: "MONTHLY" },
    activatedOn: "20260801",
    renewsOn: "20261001",
  },
];

before(() => setupDb("plan_details"));
beforeEach(async () => {
  await resetDb();
  // resetDb seeds the Branch A example subscriber with no plan; give it the
  // spec's plan + services, and add a "nothing active" subscriber alongside.
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    { $set: { plan: SPEC_PLAN, services: SPEC_SERVICES } }
  );
  await Subscriber.create({
    msisdn: "85510777222",
    name: "Kim Veasna",
    type: "PREPAID",
    balance: { main: { amount: 0, currency: "USD", expiry: "20260912" }, bonus: null },
    data: { allowanceMB: 2048, usedMB: 2048, remainingMB: 0, expiry: "20260912" },
    plan: null,
    services: [],
  });
});
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-pln-001",
  timestamp: "20260910120000",
  msisdn: "85510234567",
  ...overrides,
});

test("SUCCESS body matches the spec example exactly", async () => {
  const res = await post("/account/plan_details").send(req());

  assert.equal(res.status, 200, "every endpoint returns HTTP 200");

  // Envelope + payload, in the spec's order.
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "plan",
    "services",
  ]);

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {}, "error is {} on success");
  assert.equal(res.body.requestId, "req-pln-001", "requestId is echoed");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(res.body.subscriber, {
    msisdn: "85510234567",
    name: "Sok Dara",
    type: "PREPAID",
  });

  assert.deepEqual(res.body.plan, SPEC_PLAN);
  assert.deepEqual(res.body.services, SPEC_SERVICES);
});

test("plan key order follows the spec", async () => {
  const res = await post("/account/plan_details").send(req());

  assert.deepEqual(Object.keys(res.body.plan), [
    "planId",
    "name",
    "price",
    "activatedOn",
    "renewsOn",
    "inclusions",
  ]);
  assert.deepEqual(Object.keys(res.body.plan.price), [
    "amount",
    "currency",
    "cycle",
  ]);
  assert.deepEqual(Object.keys(res.body.plan.inclusions), [
    "dataMB",
    "onNetMinutes",
    "offNetMinutes",
    "smsCount",
  ]);
  assert.deepEqual(Object.keys(res.body.services[0]), [
    "serviceId",
    "name",
    "price",
    "activatedOn",
    "renewsOn",
  ]);
  // The agent reads these by name, so subscriber's shape is pinned too.
  assert.deepEqual(Object.keys(res.body.subscriber), [
    "msisdn",
    "name",
    "type",
  ]);
  assert.deepEqual(Object.keys(res.body.services[1]), [
    "serviceId",
    "name",
    "price",
    "activatedOn",
    "renewsOn",
  ]);
});

test("services keep the stored order", async () => {
  // The spec's example lists CallerTune before NewsAlerts; the response must
  // preserve the stored order rather than re-sorting.
  const res = await post("/account/plan_details").send(req());
  assert.deepEqual(
    res.body.services.map((s) => s.name),
    ["CallerTune", "NewsAlerts"]
  );
});

test("dates are yyyyMMdd", async () => {
  const res = await post("/account/plan_details").send(req());
  assert.match(res.body.plan.activatedOn, DATE);
  assert.match(res.body.plan.renewsOn, DATE);
  for (const s of res.body.services) {
    assert.match(s.activatedOn, DATE);
    assert.match(s.renewsOn, DATE);
  }
});

test("no active plan is a SUCCESS with plan:null and services:[]", async () => {
  const res = await post("/account/plan_details").send(
    req({ msisdn: "85510777222" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS", "not a failure — the lookup worked");
  assert.equal(res.body.plan, null);
  assert.deepEqual(res.body.services, []);
  assert.equal(res.body.subscriber.name, "Kim Veasna");
});

test("a subscriber added via the demo endpoint has no plan", async () => {
  await supertest(app)
    .post("/demo/subscribers")
    .set("x-api-key", TEST_API_KEY)
    .send({ msisdn: "9800002222", name: "Curl Added" });

  const res = await post("/account/plan_details").send(
    req({ msisdn: "9800002222" })
  );

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.plan, null);
  assert.deepEqual(res.body.services, []);
});

test("a subscriber can have a plan but no active services", async () => {
  await Subscriber.updateOne({ msisdn: "85510234567" }, { $set: { services: [] } });

  const res = await post("/account/plan_details").send(req());

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.plan, SPEC_PLAN, "the plan is intact, not just non-null");
  assert.deepEqual(res.body.services, []);
});

test("re-adding a seeded number via /demo/subscribers preserves its plan", async () => {
  // addSubscriber upserts with $set and never mentions plan/services, so an
  // update must leave Branch C data intact — otherwise a tester editing a name
  // would silently strip the plan out from under the demo.
  const res = await supertest(app)
    .post("/demo/subscribers")
    .set("x-api-key", TEST_API_KEY)
    .send({ msisdn: "85510234567", name: "Sok Dara Edited" });
  assert.equal(res.status, 200, "200 = updated an existing record");

  const after = await post("/account/plan_details").send(req());
  assert.equal(after.body.subscriber.name, "Sok Dara Edited", "name did change");
  assert.deepEqual(after.body.plan, SPEC_PLAN, "plan survived the update");
  assert.deepEqual(after.body.services, SPEC_SERVICES, "services survived");
});

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/account/plan_details").send(
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
  assert.equal(res.body.msisdn, "85510000000", "failure echoes the msisdn sent");
});

test("error.code is a string, not a number", async () => {
  const res = await post("/account/plan_details").send(
    req({ msisdn: "85510000000" })
  );
  assert.equal(typeof res.body.error.code, "string");
});

for (const [label, body] of [
  ["missing requestId", req({ requestId: undefined })],
  ["missing timestamp", req({ timestamp: undefined })],
  ["missing msisdn", req({ msisdn: undefined })],
  ["empty msisdn", req({ msisdn: "" })],
  ["non-string requestId", req({ requestId: 12345 })],
  ["short timestamp", req({ timestamp: "202609101200" })],
  ["non-numeric timestamp", req({ timestamp: "2026-09-10T12:00" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/account/plan_details").send(body);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
    assert.match(res.body.error.message, /^Malformed request: /);
  });
}

test("forced-failure msisdn returns a 500 FAILURE", async () => {
  const res = await post("/account/plan_details").send(
    req({ msisdn: "85510999500" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
  assert.equal(res.body.msisdn, "85510999500");
});

test("unparseable JSON body is a 400 FAILURE, still HTTP 200", async () => {
  const res = await post("/account/plan_details")
    .set("Content-Type", "application/json")
    .send('{"requestId": "req-pln-001",');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
});

test("wrong Content-Type is a 400 FAILURE", async () => {
  const res = await post("/account/plan_details")
    .set("Content-Type", "text/plain")
    .send("requestId=req-pln-001");

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

  for (const dialled of ["919899047146", "+919899047146", "9899047146"]) {
    const res = await post("/account/plan_details").send(req({ msisdn: dialled }));
    assert.equal(res.body.status, "SUCCESS", `${dialled} should resolve`);
    assert.equal(res.body.subscriber.name, "Ravinder Malhotra");
    assert.equal(res.body.plan.planId, "SMART-POSTPAID-20");
  }
});

test("requires the API key", async () => {
  const res = await supertest(app).post("/account/plan_details").send(req());
  assert.equal(res.status, 401);
});

// --- the shared ticket endpoint, Branch C variant ---------------------------

test("ticket/create accepts type ENQUIRY with the Branch C category", async () => {
  const res = await post("/ticket/create").send({
    requestId: "req-tkt-c1",
    timestamp: "20260910120130",
    msisdn: "85510234567",
    type: "ENQUIRY",
    category: "NEW_ENQUIRY_PREHANDLED",
    summary:
      "Customer asked which plan they are on. Read back Smart Combo 5 and active VAS list; customer satisfied.",
    callbackNumber: "85510234567",
  });

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
  assert.match(res.body.ticket.ticketId, /^TKT-\d{8}-\d{4}$/);
  assert.equal(res.body.ticket.status, "OPEN");

  // The response says SUCCESS; confirm it was actually written, with the
  // Branch C type and category, not silently dropped.
  const { Ticket } = await import("../src/models/Ticket.js");
  const stored = await Ticket.findOne({
    ticketId: res.body.ticket.ticketId,
  }).lean();
  assert.equal(stored.type, "ENQUIRY");
  assert.equal(stored.category, "NEW_ENQUIRY_PREHANDLED");
  assert.equal(stored.msisdn, "85510234567");
});

test("ticket/create still accepts COMPLAINT (Branches A and B unaffected)", async () => {
  const res = await post("/ticket/create").send({
    requestId: "req-tkt-c2",
    timestamp: "20260910120130",
    msisdn: "85510234567",
    type: "COMPLAINT",
    category: "NEW_COMPLAINT",
    summary: "Branch B complaint still works.",
    callbackNumber: "85510234567",
  });

  assert.equal(res.body.status, "SUCCESS");
});

test("ticket/create still rejects an unknown type", async () => {
  const res = await post("/ticket/create").send({
    requestId: "req-tkt-c3",
    timestamp: "20260910120130",
    msisdn: "85510234567",
    type: "FEEDBACK",
    category: "NEW_ENQUIRY_PREHANDLED",
    summary: "Should be rejected.",
    callbackNumber: "85510234567",
  });

  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
  assert.match(res.body.error.message, /COMPLAINT, ENQUIRY/);
});
