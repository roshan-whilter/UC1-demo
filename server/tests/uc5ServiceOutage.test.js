import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupDb, resetDb, teardownDb, post } from "./helpers.js";

before(() => setupDb("uc5_service_outage"));
beforeEach(resetDb);
after(teardownDb);

const request = (overrides = {}) => ({
  requestId: "req-uc5-001",
  timestamp: "20260914120000",
  msisdn: "85510234567",
  ...overrides,
});

test("POST /incident/my_status returns the caller's known incident", async () => {
  const res = await post("/incident/my_status").send(request());

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.deepEqual(Object.keys(res.body.incident), [
    "found",
    "incidentId",
    "status",
    "title",
    "summary",
    "startedAt",
    "expectedRestorationAt",
    "lastUpdatedAt",
  ]);
  assert.equal(res.body.incident.found, true);
  assert.equal(res.body.incident.incidentId, "INC-20260914-0001");
  assert.match(res.body.incident.expectedRestorationAt, /^\d{14}$/);
});

test("POST /complaint/history returns existing complaint status", async () => {
  const res = await post("/complaint/history").send(request({
    requestId: "req-cmp-001",
  }));

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.complaints.length, 1);
  assert.deepEqual(res.body.complaints[0], {
    caseId: "CMP-20260910-0003",
    type: "COMPLAINT",
    category: "NETWORK",
    status: "IN_PROGRESS",
    summary: "Customer reported mobile data unavailable.",
    createdAt: "20260910143000",
    lastUpdatedAt: "20260912110000",
    expectedResolutionAt: "20260915170000",
  });
});

test("POST /outage/send_troubleshooting_link returns the SMS deep-link payload", async () => {
  const res = await post("/outage/send_troubleshooting_link").send(
    request({
      requestId: "req-out-001",
      issueType: "MOBILE_DATA",
    })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
  assert.match(res.body.message.messageId, /^SMS-OUT-\d{8}-\d{4}$/);
  assert.equal(res.body.troubleshooting.issueType, "MOBILE_DATA");
  assert.equal(res.body.troubleshooting.stepsReference, "TS-MOBILE_DATA-001");
  assert.match(res.body.troubleshooting.link.reference, /^OUT-\d{8}-\d{4}$/);
  assert.ok(res.body.troubleshooting.link.url.includes("issue=MOBILE_DATA"));
});

test("troubleshooting endpoint rejects an unsupported issue type", async () => {
  const res = await post("/outage/send_troubleshooting_link").send(
    request({ issueType: "PRINTER" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
});