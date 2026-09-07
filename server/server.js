import { createApp } from "./src/app.js";
import { config } from "./src/config/env.js";
import { connectDb } from "./src/config/db.js";
import { logger } from "./src/utils/logger.js";

async function main() {
  // Auth is mandatory, so refuse to boot with no keys rather than come up and
  // 401 every request — a deploy that forgot API_KEYS should fail loudly.
  if (config.apiKeys.length === 0) {
    logger.error(
      "API_KEYS is empty — refusing to start.\n" +
        "  Set it in server/.env (or your host's env), comma-separated for multiple keys:\n" +
        "    API_KEYS=<key>\n" +
        "  Generate one with:\n" +
        `    node -e "console.log('uc1_'+require('node:crypto').randomBytes(32).toString('base64url'))"`
    );
    process.exit(1);
  }

  await connectDb();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`UC1 demo mock API listening on http://localhost:${config.port}`);
    logger.info(`  POST http://localhost:${config.port}/account/balance_usage`);
    logger.info(`  POST http://localhost:${config.port}/ticket/create`);
    logger.info(
      `  x-api-key required — ${config.apiKeys.length} key(s) configured`
    );
  });

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start:", err);
  process.exit(1);
});
