/**
 * Guards the SHIPPED seed file (server/seed/subscribers.json) rather than a
 * hand-built fixture.
 *
 * Every other test builds its own subscriber, so a broken seed file would pass
 * the whole suite and only fail in the live demo. These assertions also pin the
 * cross-branch consistency the Branch C spec promises: one coherent story per
 * subscriber across Branches A, B and C.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED = path.resolve(__dirname, "../seed/subscribers.json");

const subscribers = JSON.parse(await readFile(SEED, "utf8"));
const byMsisdn = Object.fromEntries(subscribers.map((s) => [s.msisdn, s]));

const DATE = /^\d{8}$/;
const TIMESTAMP = /^\d{14}$/;

/** yyyyMMdd one calendar month on — how a monthly VAS renewal date is derived. */
function plusOneMonth(yyyymmdd) {
  let y = Number(yyyymmdd.slice(0, 4));
  let m = Number(yyyymmdd.slice(4, 6)) + 1;
  const d = yyyymmdd.slice(6, 8);
  if (m > 12) {
    m = 1;
    y += 1;
  }
  return `${y}${String(m).padStart(2, "0")}${d}`;
}

test("the seed file holds the six documented demo subscribers", () => {
  assert.equal(subscribers.length, 6);
  for (const msisdn of [
    "85510234567",
    "85510555111",
    "85510777222",
    "9654987095",
    "9870566624",
    "919899047146",
  ]) {
    assert.ok(byMsisdn[msisdn], `${msisdn} is missing from the seed`);
  }
});

test("the forced-failure demo numbers are deliberately NOT seeded", () => {
  // 85510000000 must 404 and 85510999500 must 500 — seeding either would
  // silently break the two failure paths the specs advertise.
  assert.equal(byMsisdn["85510000000"], undefined);
  assert.equal(byMsisdn["85510999500"], undefined);
});

test("every subscriber has valid Branch A fields", () => {
  for (const s of subscribers) {
    assert.ok(["PREPAID", "POSTPAID"].includes(s.type), `${s.msisdn} type`);
    assert.match(s.balance.main.expiry, DATE, `${s.msisdn} balance expiry`);
    assert.match(s.data.expiry, DATE, `${s.msisdn} data expiry`);
    assert.equal(
      s.data.remainingMB,
      s.data.allowanceMB - s.data.usedMB,
      `${s.msisdn}: remainingMB must equal allowance - used`
    );
    if (s.balance.bonus !== null) {
      assert.match(s.balance.bonus.expiry, DATE, `${s.msisdn} bonus expiry`);
    }
  }
});

test("every subscriber has a coherent Branch B usage history", () => {
  for (const s of subscribers) {
    const uh = s.usageHistory;
    assert.ok(uh, `${s.msisdn} has no usageHistory`);
    assert.ok(
      ["DATA_USAGE", "VAS_DEDUCTION", "MIXED", "NONE"].includes(uh.cause.type),
      `${s.msisdn} cause.type`
    );
    // An unidentified cause must have nothing to point at, and vice versa.
    const hasRecords =
      uh.internetUsage.records.length > 0 || uh.vasDeductions.records.length > 0;
    assert.equal(
      uh.cause.identified,
      hasRecords,
      `${s.msisdn}: cause.identified must match whether any records exist`
    );
    assert.equal(
      uh.cause.identified,
      uh.cause.type !== "NONE",
      `${s.msisdn}: cause.type NONE must mean identified:false`
    );
    for (const r of uh.internetUsage.records) {
      assert.match(r.startedAt, TIMESTAMP, `${s.msisdn} startedAt`);
      assert.match(r.endedAt, TIMESTAMP, `${s.msisdn} endedAt`);
      assert.ok(r.endedAt > r.startedAt, `${s.msisdn}: session ends after start`);
    }
    const vasTotal = uh.vasDeductions.records.reduce((n, r) => n + r.amount, 0);
    assert.ok(
      Math.abs(vasTotal - uh.vasDeductions.totalAmount) < 0.001,
      `${s.msisdn}: vasDeductions.totalAmount must equal the sum of its records`
    );
  }
});

test("Branch C plan is consistent with Branch A data (the spec's claim)", () => {
  for (const s of subscribers) {
    if (s.plan === null) {
      assert.deepEqual(s.services, [], `${s.msisdn}: no plan means no services`);
      continue;
    }
    assert.equal(
      s.plan.inclusions.dataMB,
      s.data.allowanceMB,
      `${s.msisdn}: plan.inclusions.dataMB must equal Branch A data.allowanceMB`
    );
    assert.equal(
      s.plan.renewsOn,
      s.data.expiry,
      `${s.msisdn}: plan.renewsOn must equal Branch A data.expiry`
    );
    assert.match(s.plan.activatedOn, DATE, `${s.msisdn} plan.activatedOn`);
    assert.equal(s.plan.price.cycle, "MONTHLY", `${s.msisdn} plan cycle`);
  }
});

test("Branch C services match the Branch B VAS charges (the spec's claim)", () => {
  for (const s of subscribers) {
    const charges = s.usageHistory.vasDeductions.records;
    assert.equal(
      s.services.length,
      charges.length,
      `${s.msisdn}: one active service per VAS charge`
    );

    for (const svc of s.services) {
      const charge = charges.find((c) => c.service === svc.name);
      assert.ok(charge, `${s.msisdn}: service ${svc.name} has no VAS charge`);
      assert.equal(
        svc.price.amount,
        charge.amount,
        `${s.msisdn}/${svc.name}: price must equal the charged amount`
      );
      assert.equal(svc.price.currency, charge.currency, `${svc.name} currency`);
      assert.equal(
        svc.renewsOn,
        plusOneMonth(charge.chargedAt.slice(0, 8)),
        `${s.msisdn}/${svc.name}: renewsOn must be one month after the charge`
      );
      assert.equal(
        svc.serviceId,
        `VAS-${svc.name.toUpperCase()}`,
        `${svc.name} serviceId`
      );
      assert.ok(
        svc.activatedOn < svc.renewsOn,
        `${s.msisdn}/${svc.name}: activated before it renews`
      );
    }
  }
});

test("Sok Dara reproduces the Branch C spec example field for field", () => {
  const s = byMsisdn["85510234567"];
  assert.deepEqual(s.plan, {
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
  });
  assert.deepEqual(s.services, [
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
  ]);
});

test("Kim Veasna is the 'nothing active' variant every branch relies on", () => {
  const s = byMsisdn["85510777222"];
  assert.equal(s.plan, null, "Branch C: no plan");
  assert.deepEqual(s.services, [], "Branch C: no services");
  assert.equal(s.usageHistory.cause.identified, false, "Branch B: no cause");
  assert.equal(s.data.remainingMB, 0, "Branch A: data exhausted");
  assert.equal(s.balance.main.amount, 0, "Branch A: zero balance");
});

test("every subscriber has a coherent UC2 Branch B recharge history", () => {
  const CHANNELS = ["APP", "USSD", "VOUCHER", "RETAILER", "BANK", "EWALLET"];
  const STATUSES = ["CREDITED", "PENDING", "FAILED", "REVERSED"];

  for (const s of subscribers) {
    const history = s.rechargeHistory;
    assert.ok(Array.isArray(history), `${s.msisdn} rechargeHistory must be an array`);

    for (const r of history) {
      assert.match(r.rechargedAt, TIMESTAMP, `${s.msisdn} rechargedAt`);
      assert.ok(CHANNELS.includes(r.channel), `${s.msisdn} channel ${r.channel}`);
      assert.ok(STATUSES.includes(r.status), `${s.msisdn} status ${r.status}`);
      assert.ok(r.amount > 0, `${s.msisdn} amount must be positive`);
      assert.ok(r.reference, `${s.msisdn} needs a transaction reference`);

      // creditedAt is set only when money actually reached the balance.
      if (r.status === "CREDITED" || r.status === "REVERSED") {
        assert.match(r.creditedAt, TIMESTAMP, `${s.msisdn}/${r.rechargeId} creditedAt`);
        assert.ok(
          r.creditedAt >= r.rechargedAt,
          `${s.msisdn}/${r.rechargeId}: credited no earlier than charged`
        );
      } else {
        assert.equal(
          r.creditedAt,
          null,
          `${s.msisdn}/${r.rechargeId}: ${r.status} must not have a creditedAt`
        );
      }
    }
  }
});

test("the seed covers every match.status UC2 Branch B can return", () => {
  // The spec's hosting table promises all five are demonstrable. If a future
  // seed edit drops one, the demo silently loses a path — catch it here.
  const seen = new Set(
    subscribers.flatMap((s) => s.rechargeHistory.map((r) => r.status))
  );
  for (const status of ["CREDITED", "FAILED", "PENDING", "REVERSED"]) {
    assert.ok(seen.has(status), `no seeded recharge has status ${status}`);
  }
  // NOT_FOUND is demonstrated by a subscriber with no history at all.
  assert.ok(
    subscribers.some((s) => s.rechargeHistory.length === 0),
    "no subscriber has an empty recharge history (the NOT_FOUND path)"
  );
});
