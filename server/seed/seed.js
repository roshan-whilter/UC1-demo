/**
 * Loads the demo subscribers. Idempotent — upserts by msisdn, so it is safe to
 * re-run. Pass --reset to also clear tickets and the ticketId counters.
 *
 *   npm run seed
 *   npm run seed -- --reset
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../src/config/env.js";
import { connectDb, disconnectDb } from "../src/config/db.js";
import { Subscriber } from "../src/models/Subscriber.js";
import { Ticket } from "../src/models/Ticket.js";
import { Counter } from "../src/models/Counter.js";
import { logger } from "../src/utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function seed() {
  const reset = process.argv.includes("--reset");

  await connectDb();

  const raw = await readFile(path.join(__dirname, "subscribers.json"), "utf8");
  const subscribers = JSON.parse(raw);

  if (reset) {
    const [tickets, counters] = await Promise.all([
      Ticket.deleteMany({}),
      Counter.deleteMany({}),
    ]);
    logger.info(
      `reset: removed ${tickets.deletedCount} ticket(s), ${counters.deletedCount} counter(s)`
    );
  }

  for (const subscriber of subscribers) {
    // A seed file that omits remainingMB gets it derived, so the payload the
    // agent reads out can never contradict allowance/used.
    if (subscriber.data.remainingMB === undefined) {
      subscriber.data.remainingMB = Math.max(
        0,
        subscriber.data.allowanceMB - subscriber.data.usedMB
      );
    }

    await Subscriber.findOneAndUpdate(
      { msisdn: subscriber.msisdn },
      { $set: subscriber },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    logger.info(`upserted ${subscriber.msisdn} (${subscriber.name})`);
  }

  logger.info(`\nDemo numbers:`);
  logger.info(`  SUCCESS  85510234567  (matches the spec's example payload)`);
  logger.info(`  SUCCESS  85510555111  (POSTPAID, bonus: null)`);
  logger.info(`  SUCCESS  85510777222  (zero balance, data exhausted)`);
  logger.info(`  404      any unseeded number, e.g. 85510000000`);
  logger.info(
    `  500      ${config.forceBalanceErrorMsisdns.join(", ") || "(none configured)"}`
  );

  await disconnectDb();
}

seed().catch(async (err) => {
  logger.error("Seed failed:", err);
  await disconnectDb().catch(() => {});
  process.exit(1);
});
