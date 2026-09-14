/**
 * Contract tests for the approved UC4 service-assistance endpoints.
 */

import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setupDb, resetDb, teardownDb, post } from "./helpers.js";

before(() => setupDb("uc4_service_assistance"));
beforeEach(async () => {
  await resetDb();
});
after(teardownDb);

const serviceReq = (overrides = {}) => ({
  requestId: "req-dac-001",
  timestamp: "20260912120000",
  msisdn: "85510234567",
  serviceId: "VAS-CALLERTUNE",
  ...overrides,
});

const simReq = (overrides = {}) => ({
  requestId: "req-sim-001",
  timestamp: "20260912120000",
  msisdn: "85510234567",
  ...overrides,
});

test("POST /service/send_deactivation_link returns the approved SMS payload", async () => {
  const res = await post("/service/send_deactivation_link").send(serviceReq());

  assert.equal(res.status, 200, "every endpoint returns HTTP 200");
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.equal(res.body.requestId, "req-dac-001");
  assert.match(res.body.timestamp, /^\d{14}$/);

  assert.deepEqual(Object.keys(res.body.subscriber), ["msisdn", "name", "type"]);
  assert.deepEqual(Object.keys(res.body.message), [
    "messageId",
    "channel",
    "to",
    "status",
    "sentAt",
    "resendCount",
  ]);
  assert.deepEqual(Object.keys(res.body.deactivation), [
    "serviceId",
    "serviceName",
    "ussdCode",
    "link",
  ]);
  assert.equal(res.body.deactivation.serviceId, "VAS-CALLERTUNE");
  assert.equal(res.body.deactivation.serviceName, "CallerTune");
  assert.equal(res.body.deactivation.ussdCode, "*123*4*1#");
  assert.match(res.body.message.messageId, /^SMS-DAC-\d{8}-\d{4}$/);
  assert.match(res.body.deactivation.link.reference, /^DAC-\d{8}-\d{4}$/);
  assert.ok(res.body.deactivation.link.url.includes("service=VAS-CALLERTUNE"));
  assert.match(res.body.deactivation.link.expiresAt, /^\d{14}$/);
});

test("POST /sim/status reports the current validity state and expiry", async () => {
  const res = await post("/sim/status").send(simReq());

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {});
  assert.deepEqual(Object.keys(res.body.subscriber), ["msisdn", "name", "type"]);
  assert.deepEqual(Object.keys(res.body.validity), ["type", "expiryDate"]);
  assert.equal(res.body.validity.type, "FULL");
  assert.match(res.body.validity.expiryDate, /^\d{8}$/);
});

test("service endpoint rejects a service the subscriber does not currently hold", async () => {
  const res = await post("/service/send_deactivation_link").send(
    serviceReq({ serviceId: "VAS-NOPE" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
});
