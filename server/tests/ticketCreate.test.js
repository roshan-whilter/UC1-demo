/**
 * Contract tests for POST /ticket/create.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  post,
  setupDb,
  resetDb,
  teardownDb,
  ticketRequest,
} from "./helpers.js";

const TIMESTAMP = /^\d{14}$/;
const TICKET_ID = /^TKT-\d{8}-\d{4}$/;

before(() => setupDb("ticket_create"));
beforeEach(resetDb);
after(teardownDb);

test("SUCCESS body matches the spec example", async () => {
  const res = await post("/ticket/create").send(ticketRequest());

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "ticket",
  ]);

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-tkt-001");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(Object.keys(res.body.ticket), [
    "ticketId",
    "status",
    "createdAt",
  ]);
  assert.match(res.body.ticket.ticketId, TICKET_ID);
  assert.equal(res.body.ticket.status, "OPEN");
  assert.match(res.body.ticket.createdAt, TIMESTAMP);
});

test("ticketId sequence increments per day, zero-padded to 4", async () => {
  const first = await post("/ticket/create").send(ticketRequest());
  const second = await post("/ticket/create")
    .send(ticketRequest({ requestId: "req-tkt-002" }));

  const day = first.body.ticket.createdAt.slice(0, 8);
  assert.equal(first.body.ticket.ticketId, `TKT-${day}-0001`);
  assert.equal(second.body.ticket.ticketId, `TKT-${day}-0002`);
});

test("concurrent creates never collide on a ticketId", async () => {
  const responses = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      post("/ticket/create")
        .send(ticketRequest({ requestId: `req-tkt-${i}` }))
    )
  );

  const ids = responses.map((res) => res.body.ticket.ticketId);
  assert.equal(new Set(ids).size, 10, "all ticketIds are distinct");
});

test("callbackNumber defaults to msisdn when omitted", async () => {
  const res = await post("/ticket/create")
    .send(ticketRequest({ callbackNumber: undefined }));

  assert.equal(res.body.status, "SUCCESS");

  const { Ticket } = await import("../src/models/Ticket.js");
  const stored = await Ticket.findOne({
    ticketId: res.body.ticket.ticketId,
  }).lean();
  assert.equal(stored.callbackNumber, "85510234567");
});

test("a ticket is created for an unknown msisdn (the 404 fallback path)", async () => {
  const res = await post("/ticket/create")
    .send(ticketRequest({ msisdn: "85510000000" }));

  assert.equal(
    res.body.status,
    "SUCCESS",
    "ticket creation must not require the subscriber to exist"
  );
  assert.match(res.body.ticket.ticketId, TICKET_ID);
});

test("the request is persisted as sent", async () => {
  const body = ticketRequest();
  const res = await post("/ticket/create").send(body);

  const { Ticket } = await import("../src/models/Ticket.js");
  const stored = await Ticket.findOne({
    ticketId: res.body.ticket.ticketId,
  }).lean();

  assert.equal(stored.msisdn, body.msisdn);
  assert.equal(stored.type, "COMPLAINT");
  assert.equal(stored.category, "BALANCE_USAGE");
  assert.equal(stored.summary, body.summary);
  assert.equal(stored.requestId, body.requestId);
  assert.equal(stored.status, "OPEN");
});

for (const [label, body] of [
  ["missing requestId", ticketRequest({ requestId: undefined })],
  ["missing timestamp", ticketRequest({ timestamp: undefined })],
  ["missing msisdn", ticketRequest({ msisdn: undefined })],
  ["missing type", ticketRequest({ type: undefined })],
  ["unknown type", ticketRequest({ type: "FEEDBACK" })],
  ["missing category", ticketRequest({ category: undefined })],
  ["missing summary", ticketRequest({ summary: undefined })],
  ["empty summary", ticketRequest({ summary: "   " })],
  ["oversized summary", ticketRequest({ summary: "x".repeat(2001) })],
  ["unusable callbackNumber", ticketRequest({ callbackNumber: "n/a" })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/ticket/create").send(body);

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body), [
      "status",
      "error",
      "requestId",
      "timestamp",
      "msisdn",
    ]);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
  });
}

test("forced-failure msisdn returns the spec's ticket 500", async () => {
  const res = await post("/ticket/create")
    .send(ticketRequest({ msisdn: "85510999500" }));

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.deepEqual(res.body.error, {
    code: "500",
    message: "Unable to create ticket",
  });
  assert.equal(res.body.msisdn, "85510999500");
  assert.equal(res.body.requestId, "req-tkt-001");
});

test("no ticket is stored when creation fails", async () => {
  await post("/ticket/create")
    .send(ticketRequest({ msisdn: "85510999500" }));

  const { Ticket } = await import("../src/models/Ticket.js");
  assert.equal(await Ticket.countDocuments({}), 0);
});

test("unknown endpoint answers with a plain HTTP 404", async () => {
  const res = await post("/ticket/created").send({});
  assert.equal(res.status, 404);
  assert.deepEqual(res.body.endpoints, [
    "POST /account/balance_usage",
    "POST /account/usage_history",
    "POST /account/plan_details",
    "POST /ticket/create",
  ]);
});
