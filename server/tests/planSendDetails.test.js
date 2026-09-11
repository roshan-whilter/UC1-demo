/**
 * Contract tests for POST /plan/send_details (UC3 Branch A).
 *
 * The project's second ACTION endpoint. Nothing is really texted, so these
 * assert two things at once: the response the agent parses, and the row the
 * mock persisted — a SUCCESS that wrote nothing would still let `resendCount`
 * and the console lie.
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
import { PlanMessage } from "../src/models/PlanMessage.js";

const TIMESTAMP = /^\d{14}$/;

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

const SPEC_PREVIOUS_PLANS = [
  {
    planId: "SMART-COMBO-3",
    name: "Smart Combo 3",
    price: { amount: 3.0, currency: "USD", cycle: "MONTHLY" },
    activatedOn: "20260701",
    endedOn: "20260830",
    inclusions: {
      dataMB: 5120,
      onNetMinutes: 150,
      offNetMinutes: 30,
      smsCount: 50,
    },
  },
  {
    planId: "SMART-MINI-1",
    name: "Smart Mini 1",
    price: { amount: 1.0, currency: "USD", cycle: "WEEKLY" },
    activatedOn: "20260601",
    endedOn: "20260630",
    inclusions: {
      dataMB: 1024,
      onNetMinutes: 50,
      offNetMinutes: 0,
      smsCount: 20,
    },
  },
];

/** The exact text the spec's example shows, character for character. */
const SPEC_SUMMARY =
  "Smart Combo 5 — 5.00 USD monthly, renews 30 Sep 2026. " +
  "Includes 10 GB data, 300 on-net and 60 off-net minutes, 100 SMS. " +
  "Add-ons: CallerTune 0.50 USD/mo, NewsAlerts 0.25 USD/mo.";

before(() => setupDb("plan_send_details"));
beforeEach(async () => {
  await resetDb();
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    {
      $set: {
        plan: SPEC_PLAN,
        services: SPEC_SERVICES,
        previousPlans: SPEC_PREVIOUS_PLANS,
      },
    }
  );
  // The "nothing active" subscriber — nothing to send, so a 422.
  await Subscriber.create({
    msisdn: "85510777222",
    name: "Kim Veasna",
    type: "PREPAID",
    balance: { main: { amount: 0, currency: "USD", expiry: "20260912" }, bonus: null },
    data: { allowanceMB: 2048, usedMB: 2048, remainingMB: 0, expiry: "20260912" },
    plan: null,
    services: [],
    previousPlans: [],
  });
});
after(teardownDb);

const req = (overrides = {}) => ({
  requestId: "req-psm-001",
  timestamp: "20260911120000",
  msisdn: "85510234567",
  ...overrides,
});

// --- the happy path ---------------------------------------------------------

test("SUCCESS body matches the spec example exactly", async () => {
  const res = await post("/plan/send_details").send(req());

  assert.equal(res.status, 200, "every spec endpoint returns HTTP 200");

  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "subscriber",
    "message",
    "content",
  ]);

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.error, {}, "error is {} on success");
  assert.equal(res.body.requestId, "req-psm-001", "requestId is echoed");
  assert.match(res.body.timestamp, TIMESTAMP);

  assert.deepEqual(res.body.subscriber, {
    msisdn: "85510234567",
    name: "Sok Dara",
    type: "PREPAID",
  });

  assert.deepEqual(Object.keys(res.body.message), [
    "messageId",
    "channel",
    "to",
    "status",
    "sentAt",
    "resendCount",
  ]);
  assert.equal(res.body.message.channel, "SMS");
  assert.equal(res.body.message.to, "85510234567");
  assert.equal(res.body.message.status, "SENT");
  assert.match(res.body.message.sentAt, TIMESTAMP);
  assert.equal(res.body.message.resendCount, 0, "first send of the day");

  assert.deepEqual(Object.keys(res.body.content), [
    "planId",
    "planName",
    "scope",
    "includesAddOns",
    "summary",
  ]);
  assert.deepEqual(res.body.content, {
    planId: "SMART-COMBO-5",
    planName: "Smart Combo 5",
    scope: "CURRENT",
    includesAddOns: true,
    summary: SPEC_SUMMARY,
  });
});

test("messageId uses the SMS-PLN- prefix and a 4-digit daily sequence", async () => {
  const res = await post("/plan/send_details").send(req());
  assert.match(res.body.message.messageId, /^SMS-PLN-\d{8}-\d{4}$/);
});

test("the plan SMS series cannot collide with UC2 Branch A's", async () => {
  // Two endpoints, two counters. Both draw sequence 0001 on their first send of
  // a day, so the ONLY thing keeping the ids distinct is the PLN segment —
  // asserting the ids merely differ would pass on the prefix alone and prove
  // nothing. Pin the shared sequence number, then the differing prefix.
  const plan = await post("/plan/send_details").send(req());
  const recharge = await post("/recharge/send_link").send({
    requestId: "req-rcg-001",
    timestamp: "20260911120000",
    msisdn: "85510234567",
    amount: 5.0,
  });

  assert.equal(recharge.body.status, "SUCCESS");

  const planId = plan.body.message.messageId;
  const rechargeId = recharge.body.message.messageId;

  assert.match(planId, /^SMS-PLN-\d{8}-0001$/, "plan series starts at 0001");
  assert.match(rechargeId, /^SMS-\d{8}-0001$/, "recharge series also starts at 0001");
  assert.equal(
    planId.slice(-4),
    rechargeId.slice(-4),
    "precondition: both counters really are on the same sequence number"
  );
  assert.notEqual(planId, rechargeId, "yet the ids differ — the prefix is load-bearing");
});

test("the daily sequence increments within a day and is zero-padded", async () => {
  const ids = [];
  for (const requestId of ["req-psm-a", "req-psm-b", "req-psm-c"]) {
    const res = await post("/plan/send_details").send(req({ requestId }));
    ids.push(res.body.message.messageId);
  }

  assert.deepEqual(
    ids.map((id) => id.slice(-4)),
    ["0001", "0002", "0003"],
    "one sequence per send, zero-padded to 4"
  );
  assert.equal(new Set(ids).size, 3, "and every id is unique");
});

test("the send is actually persisted, not just reported", async () => {
  const res = await post("/plan/send_details").send(req());

  const stored = await PlanMessage.findOne({
    messageId: res.body.message.messageId,
  }).lean();

  assert.ok(stored, "a SUCCESS must leave a row behind");
  assert.equal(stored.msisdn, "85510234567");
  assert.equal(stored.planId, "SMART-COMBO-5");
  assert.equal(stored.scope, "CURRENT");
  assert.equal(stored.includesAddOns, true);
  assert.equal(stored.summary, SPEC_SUMMARY);
  assert.equal(stored.requestId, "req-psm-001");
});

test("resendCount counts today's earlier sends, and re-sending is allowed", async () => {
  // Re-sending is deliberately not blocked — a caller who says "it didn't
  // arrive" should get another text, not a refusal. The count is the record.
  const first = await post("/plan/send_details").send(req());
  const second = await post("/plan/send_details").send(
    req({ requestId: "req-psm-002" })
  );
  const third = await post("/plan/send_details").send(
    req({ requestId: "req-psm-003" })
  );

  assert.equal(first.body.message.resendCount, 0);
  assert.equal(second.body.message.resendCount, 1);
  assert.equal(third.body.message.resendCount, 2);
  assert.equal(await PlanMessage.countDocuments({}), 3);
});

test("resendCount counts TODAY only, not the subscriber's whole history", async () => {
  // Every other resendCount assertion runs inside a single day, so none of them
  // would notice the per-day filter being dropped. Yesterday's send is planted
  // directly to make the boundary testable.
  await PlanMessage.create({
    messageId: "SMS-PLN-20260910-0001",
    msisdn: "85510234567",
    to: "85510234567",
    channel: "SMS",
    status: "SENT",
    planId: "SMART-COMBO-5",
    planName: "Smart Combo 5",
    scope: "CURRENT",
    includesAddOns: false,
    summary: "yesterday's send",
    sentAt: "20260910120000",
    requestId: "req-psm-yesterday",
    day: "20260910",
  });

  const res = await post("/plan/send_details").send(req());

  assert.equal(
    res.body.message.resendCount,
    0,
    "a send on an earlier day must not count towards today's resends"
  );
});

test("resendCount is per subscriber, not global", async () => {
  await post("/plan/send_details").send(req());
  await post("/plan/send_details").send(req({ requestId: "req-psm-002" }));

  await Subscriber.updateOne(
    { msisdn: "85510777222" },
    { $set: { plan: SPEC_PLAN } }
  );
  const other = await post("/plan/send_details").send(
    req({ requestId: "req-psm-003", msisdn: "85510777222" })
  );

  assert.equal(other.body.message.resendCount, 0, "a different number starts at 0");
});

// --- choosing which plan to send -------------------------------------------

test("omitting planId sends the current active plan", async () => {
  const res = await post("/plan/send_details").send(req());
  assert.equal(res.body.content.scope, "CURRENT");
  assert.equal(res.body.content.planId, "SMART-COMBO-5");
});

test("naming the current plan explicitly is the same as omitting it", async () => {
  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-COMBO-5" })
  );
  assert.equal(res.body.content.scope, "CURRENT");
  assert.equal(res.body.content.includesAddOns, true);
});

test("naming a previous plan sends that one, with PREVIOUS scope", async () => {
  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-COMBO-3" })
  );

  assert.equal(res.body.status, "SUCCESS");
  assert.deepEqual(res.body.content, {
    planId: "SMART-COMBO-3",
    planName: "Smart Combo 3",
    scope: "PREVIOUS",
    includesAddOns: false,
    summary:
      "Smart Combo 3 — 3.00 USD monthly, ended 30 Aug 2026. " +
      "Included 5 GB data, 150 on-net and 30 off-net minutes, 50 SMS.",
  });
});

test("a previous plan's text says 'ended', never 'renews'", async () => {
  // The wording matters as much as the field: an ended plan that reads
  // "renews" tells the caller something false in the one artefact they keep.
  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-MINI-1" })
  );

  assert.match(res.body.content.summary, /ended 30 Jun 2026/);
  assert.doesNotMatch(res.body.content.summary, /renews/);
});

test("the billing cycle is read from the plan, not assumed monthly", async () => {
  // SMART-MINI-1 is the only WEEKLY plan in the demo data. Every other
  // assertion here happens to use a MONTHLY plan, so without this a hardcoded
  // "monthly" would pass the whole suite and tell a weekly subscriber their
  // 1.00 USD was a monthly charge.
  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-MINI-1" })
  );

  assert.equal(
    res.body.content.summary,
    "Smart Mini 1 — 1.00 USD weekly, ended 30 Jun 2026. " +
      "Included 1 GB data, 50 on-net and 0 off-net minutes, 20 SMS."
  );
  assert.doesNotMatch(res.body.content.summary, /monthly/);
});

test("an add-on's cycle suffix is read from the add-on, not assumed /mo", async () => {
  // Same failure mode one level down: the add-on list builds its own suffix.
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    {
      $set: {
        services: [
          {
            serviceId: "VAS-WEEKLYPASS",
            name: "WeeklyPass",
            price: { amount: 0.75, currency: "USD", cycle: "WEEKLY" },
            activatedOn: "20260901",
            renewsOn: "20260908",
          },
        ],
      },
    }
  );

  const res = await post("/plan/send_details").send(req());

  assert.match(res.body.content.summary, /Add-ons: WeeklyPass 0\.75 USD\/wk\./);
  assert.doesNotMatch(res.body.content.summary, /USD\/mo/);
});

test("sub-gigabyte and fractional allowances read sensibly", async () => {
  // dataAmount has three branches and only the whole-GB one is otherwise hit.
  for (const [dataMB, expected] of [
    [512, "512 MB"],
    [1536, "1.5 GB"],
    [10240, "10 GB"],
  ]) {
    await Subscriber.updateOne(
      { msisdn: "85510234567" },
      { $set: { "plan.inclusions.dataMB": dataMB } }
    );

    const res = await post("/plan/send_details").send(req());
    assert.match(
      res.body.content.summary,
      new RegExp(`Includes ${expected.replace(".", "\\.")} data,`),
      `${dataMB} MB should read as ${expected}`
    );
  }
});

test("add-ons are never attached to a previous plan", async () => {
  // We hold no historical add-on data, so listing today's VAS against a plan
  // the caller left months ago would be an invention.
  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-COMBO-3" })
  );

  assert.equal(res.body.content.includesAddOns, false);
  assert.doesNotMatch(res.body.content.summary, /Add-ons/);
  assert.doesNotMatch(res.body.content.summary, /CallerTune/);
});

test("a current plan with no add-ons reports includesAddOns false", async () => {
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    { $set: { services: [] } }
  );

  const res = await post("/plan/send_details").send(req());

  assert.equal(res.body.content.includesAddOns, false);
  assert.doesNotMatch(res.body.content.summary, /Add-ons/);
  assert.match(res.body.content.summary, /^Smart Combo 5 — 5\.00 USD monthly/);
});

test("the current plan wins when the same planId is also in history", async () => {
  // A caller who left a plan and later came back is on it NOW, and "now" is
  // the honest answer.
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    {
      $set: {
        previousPlans: [
          {
            ...SPEC_PREVIOUS_PLANS[0],
            planId: "SMART-COMBO-5",
            name: "Smart Combo 5",
          },
        ],
      },
    }
  );

  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-COMBO-5" })
  );

  assert.equal(res.body.content.scope, "CURRENT");
  assert.match(res.body.content.summary, /renews/);
});

test("a plan beyond the visible cap cannot be sent", async () => {
  // plan_details only ever reads out 2 previous plans. If send_details would
  // accept a third, the agent could text a plan the caller was never told
  // about — the two endpoints must agree on which plans exist.
  await Subscriber.updateOne(
    { msisdn: "85510234567" },
    {
      $set: {
        previousPlans: [
          ...SPEC_PREVIOUS_PLANS,
          {
            planId: "SMART-ANCIENT-0",
            name: "Smart Ancient 0",
            price: { amount: 0.5, currency: "USD", cycle: "MONTHLY" },
            activatedOn: "20260101",
            endedOn: "20260131",
            inclusions: {
              dataMB: 256,
              onNetMinutes: 10,
              offNetMinutes: 0,
              smsCount: 5,
            },
          },
        ],
      },
    }
  );

  const details = await post("/account/plan_details").send(req());
  assert.equal(
    details.body.previousPlans.find((p) => p.planId === "SMART-ANCIENT-0"),
    undefined,
    "precondition: plan_details does not expose it"
  );

  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-ANCIENT-0" })
  );

  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
});

// --- failures ---------------------------------------------------------------

test("an unknown planId is a 422 FAILURE, still HTTP 200", async () => {
  const res = await post("/plan/send_details").send(
    req({ planId: "SMART-NOT-MINE" })
  );

  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), [
    "status",
    "error",
    "requestId",
    "timestamp",
    "msisdn",
  ]);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
  assert.match(res.body.error.message, /^Unknown plan: /);
  assert.equal(res.body.msisdn, "85510234567");
});

test("a subscriber with no plan at all is a 422, not a 500", async () => {
  // Nothing is broken — the request simply cannot be fulfilled.
  const res = await post("/plan/send_details").send(
    req({ msisdn: "85510777222" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "422");
  assert.match(res.body.error.message, /no active plan/);
});

test("nothing is persisted when the send fails", async () => {
  await post("/plan/send_details").send(req({ planId: "SMART-NOT-MINE" }));
  await post("/plan/send_details").send(req({ msisdn: "85510777222" }));
  await post("/plan/send_details").send(req({ msisdn: "85510000000" }));

  assert.equal(
    await PlanMessage.countDocuments({}),
    0,
    "a FAILURE must not leave a phantom send behind"
  );
});

test("unknown number is a 404 FAILURE, still HTTP 200", async () => {
  const res = await post("/plan/send_details").send(
    req({ msisdn: "85510000000" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.deepEqual(res.body.error, {
    code: "404",
    message: "Subscriber not found",
  });
  assert.equal(res.body.msisdn, "85510000000", "failure echoes the msisdn sent");
});

test("forced-failure msisdn returns a 500 — the gateway-down demo", async () => {
  const res = await post("/plan/send_details").send(
    req({ msisdn: "85510999500" })
  );

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "500");
  assert.equal(res.body.error.message, "SMS gateway unavailable");
  assert.equal(res.body.msisdn, "85510999500");
});

test("the forced 500 wins over a would-be 404", async () => {
  // 85510999500 is not seeded. If the lookup ran first the demo would show a
  // 404 instead of the gateway-down path it is configured for.
  const res = await post("/plan/send_details").send(
    req({ msisdn: "85510999500" })
  );
  assert.equal(res.body.error.code, "500");
});

test("error.code is a string, not a number", async () => {
  const res = await post("/plan/send_details").send(
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
  ["short timestamp", req({ timestamp: "202609111200" })],
  ["non-numeric timestamp", req({ timestamp: "2026-09-11T12:00" })],
  ["non-string planId", req({ planId: 12345 })],
  ["empty planId", req({ planId: "   " })],
]) {
  test(`400 FAILURE: ${label}`, async () => {
    const res = await post("/plan/send_details").send(body);

    assert.equal(res.status, 200);
    assert.equal(res.body.status, "FAILURE");
    assert.equal(res.body.error.code, "400");
    assert.match(res.body.error.message, /^Malformed request: /);
  });
}

test("a null planId means 'the current plan', not a bad request", async () => {
  // JSON serialisers commonly emit null for an absent optional field.
  const res = await post("/plan/send_details").send(req({ planId: null }));

  assert.equal(res.body.status, "SUCCESS");
  assert.equal(res.body.content.scope, "CURRENT");
});

test("unparseable JSON body is a 400 FAILURE, still HTTP 200", async () => {
  const res = await post("/plan/send_details")
    .set("Content-Type", "application/json")
    .send('{"requestId": "req-psm-001",');

  assert.equal(res.status, 200);
  assert.equal(res.body.status, "FAILURE");
  assert.equal(res.body.error.code, "400");
});

test("wrong Content-Type is a 400 FAILURE", async () => {
  const res = await post("/plan/send_details")
    .set("Content-Type", "text/plain")
    .send("requestId=req-psm-001");

  assert.equal(res.status, 200);
  assert.equal(res.body.error.code, "400");
});

// --- lookup and auth --------------------------------------------------------

test("country-code tolerant lookup, and `to` is the canonical number", async () => {
  // The SMS must go to the stored number, not the raw string the caller typed —
  // otherwise "+855 10 234 567" would produce a malformed destination.
  for (const dialled of ["85510234567", "+85510234567", "+855 10 234 567"]) {
    const res = await post("/plan/send_details").send(req({ msisdn: dialled }));
    assert.equal(res.body.status, "SUCCESS", `${dialled} should resolve`);
    assert.equal(res.body.message.to, "85510234567", `${dialled} -> canonical`);
    assert.equal(res.body.subscriber.msisdn, "85510234567");
  }
});

test("requires the API key", async () => {
  const res = await supertest(app).post("/plan/send_details").send(req());
  assert.equal(res.status, 401);
  assert.equal(res.body.status, "FAILURE");
});

test("a rejected key sends nothing", async () => {
  await supertest(app)
    .post("/plan/send_details")
    .set("x-api-key", "not-a-real-key")
    .send(req());

  assert.equal(await PlanMessage.countDocuments({}), 0);
});

// --- the demo helper --------------------------------------------------------

test("GET /demo/plan_messages lists what was sent, newest first", async () => {
  await post("/plan/send_details").send(req());
  await post("/plan/send_details").send(
    req({ requestId: "req-psm-002", planId: "SMART-COMBO-3" })
  );

  const res = await supertest(app)
    .get("/demo/plan_messages")
    .set("x-api-key", TEST_API_KEY);

  assert.equal(res.status, 200);
  assert.equal(res.body.planMessages.length, 2);
  assert.ok(
    res.body.planMessages.every((m) => m.messageId.startsWith("SMS-PLN-"))
  );

  // The name of this test promises ordering, so assert it rather than implying
  // it — the second send must come back first.
  const ids = res.body.planMessages.map((m) => m.messageId);
  assert.deepEqual(ids, [...ids].sort().reverse(), "newest first");
  assert.equal(
    res.body.planMessages[0].planId,
    "SMART-COMBO-3",
    "the most recent send leads"
  );

  // Mongo internals must not leak through a console helper.
  for (const m of res.body.planMessages) {
    assert.equal(m._id, undefined);
    assert.equal(m.__v, undefined);
  }
});

test("GET /demo/plan_messages honours ?limit", async () => {
  for (const requestId of ["req-psm-1", "req-psm-2", "req-psm-3"]) {
    await post("/plan/send_details").send(req({ requestId }));
  }

  const res = await supertest(app)
    .get("/demo/plan_messages?limit=2")
    .set("x-api-key", TEST_API_KEY);

  assert.equal(res.body.planMessages.length, 2, "limit is applied");
});

test("GET /demo/plan_messages requires the API key", async () => {
  const res = await supertest(app).get("/demo/plan_messages");
  assert.equal(res.status, 401);
});
