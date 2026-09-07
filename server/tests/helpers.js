import mongoose from "mongoose";
import supertest from "supertest";
import { createApp } from "../src/app.js";
import { Subscriber } from "../src/models/Subscriber.js";
import { Ticket } from "../src/models/Ticket.js";
import { Counter } from "../src/models/Counter.js";

const TEST_URI =
  process.env.MONGO_URI_TEST ||
  "mongodb://root:root@localhost:27017/uc1_demo_mock_test?authSource=admin";

/**
 * `node --test` runs each test file in its own process, in parallel. Each file
 * therefore gets its own database — otherwise their resets race and collide.
 */
function uriFor(namespace) {
  const url = new URL(TEST_URI);
  const base = url.pathname.replace(/^\//, "") || "uc1_demo_mock_test";
  url.pathname = `/${base}_${namespace}`;
  return url.toString();
}

/** The spec's own example subscriber, field for field. */
export const SPEC_SUBSCRIBER = {
  msisdn: "85510234567",
  name: "Sok Dara",
  type: "PREPAID",
  balance: {
    main: { amount: 2.75, currency: "USD", expiry: "20261005" },
    bonus: { amount: 0.5, currency: "USD", expiry: "20260915" },
  },
  data: {
    allowanceMB: 10240,
    usedMB: 7680,
    remainingMB: 2560,
    expiry: "20260930",
  },
};

export async function setupDb(namespace) {
  await mongoose.connect(uriFor(namespace), { serverSelectionTimeoutMS: 5000 });
  await resetDb();
}

export async function resetDb() {
  await Promise.all([
    Subscriber.deleteMany({}),
    Ticket.deleteMany({}),
    Counter.deleteMany({}),
  ]);
  await Subscriber.create(SPEC_SUBSCRIBER);
}

export async function teardownDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

export const app = createApp();

/**
 * The key the test run is configured with (set by the npm test script). Every
 * endpoint now requires one, so tests go through `post()` rather than raw
 * supertest — a bare supertest call would only ever see a 401.
 */
export const TEST_API_KEY = (process.env.API_KEYS || "").split(",")[0];

/** Authenticated POST — the default for every contract test. */
export const post = (path) =>
  supertest(app).post(path).set("x-api-key", TEST_API_KEY);

/** Unauthenticated POST — for the auth tests themselves. */
export const rawPost = (path) => supertest(app).post(path);

/** Request bodies straight from the spec. */
export const balanceRequest = (overrides = {}) => ({
  requestId: "req-bal-001",
  timestamp: "20260907120000",
  msisdn: "85510234567",
  ...overrides,
});

export const ticketRequest = (overrides = {}) => ({
  requestId: "req-tkt-001",
  timestamp: "20260907120130",
  msisdn: "85510234567",
  type: "COMPLAINT",
  category: "BALANCE_USAGE",
  summary: "Customer says 2 GB of data disappeared overnight without use.",
  callbackNumber: "85510234567",
  ...overrides,
});
