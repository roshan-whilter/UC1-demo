import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config } from "./config/env.js";
import { specRoutes, isSpecPath, SPEC_PATHS } from "./routes/specRoutes.js";
import { demoRoutes } from "./routes/demoRoutes.js";
import { isAuthorized, requireApiKey } from "./middleware/apiKeyAuth.js";
import { failure } from "./utils/envelope.js";
import { badRequest, toAppError } from "./utils/errors.js";
import { logger } from "./utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built React console. Present in the Docker image (the build stage
// produces it) and absent in plain local dev, where Vite serves it on :4200.
const CLIENT_DIST = path.resolve(__dirname, "../../client/dist");

export function createApp() {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Helmet's default CSP includes upgrade-insecure-requests. This demo
          // is served over plain HTTP, where that directive rewrites the
          // console's own asset URLs to https:// — a port with no TLS
          // listener — and the page renders blank. Drop just that directive
          // and keep the rest of the policy.
          upgradeInsecureRequests: null,
        },
      },
    })
  );
  // x-api-key is listed explicitly so the browser preflight lets the console
  // send it. Narrow CORS_ORIGIN to the console's real origin once deployed.
  app.use(
    cors({
      origin: config.corsOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "x-api-key"],
    })
  );
  app.use(express.json({ limit: "64kb" }));

  /**
   * express.json() rejects an unparseable or oversized body by throwing, which
   * by default would produce a bare HTTP 400 — the one thing the spec's
   * "everything is HTTP 200" convention forbids. Convert those to a FAILURE
   * envelope with error.code "400".
   *
   * Registered immediately after express.json() so it sees that middleware's
   * errors; non-spec paths keep normal HTTP semantics.
   */
  app.use((err, req, res, next) => {
    const isBodyError =
      err?.type === "entity.parse.failed" ||
      err?.type === "entity.too.large" ||
      err instanceof SyntaxError;

    if (!isBodyError) return next(err);

    // express.json() runs before routing, so this handler is reached before the
    // route's own requireApiKey. Re-check here: an unauthorised caller must not
    // learn anything about their request, not even that the JSON was bad.
    if (!isAuthorized(req)) return requireApiKey(req, res, next);

    if (!isSpecPath(req.path)) {
      return res.status(400).json({ message: "Invalid JSON body" });
    }

    const detail =
      err.type === "entity.too.large"
        ? "body exceeds the 64kb limit"
        : "body is not valid JSON";

    logger.warn(`${req.path} FAILURE code=400 message=${detail}`);
    return res
      .status(200)
      .json(failure(undefined, undefined, badRequest(detail)));
  });

  app.use("/", specRoutes);
  app.use("/demo", demoRoutes);

  // Serve the console from the same origin as the API, AFTER the routes above
  // so a static file can never shadow an endpoint. Same-origin means the
  // console's relative fetches work with no proxy and no CORS.
  if (existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));

    // Single-page fallback for browser navigations only. Restricted to GETs
    // that want HTML, so a mistyped API path still gets the JSON 404 below
    // rather than a page of HTML.
    app.get(/.*/, (req, res, next) => {
      if (!req.accepts("html")) return next();
      res.sendFile(path.join(CLIENT_DIST, "index.html"));
    });
  }

  // Unknown path: an ordinary HTTP 404 with a pointer to the real endpoints.
  // The HTTP-200 convention covers the two documented endpoints, not typos.
  app.use((req, res) => {
    res.status(404).json({
      message: `No such endpoint: ${req.method} ${req.originalUrl}`,
      endpoints: SPEC_PATHS.map((path) => `POST ${path}`),
    });
  });

  // Last resort: a throw that escaped a controller still answers in-contract.
  app.use((err, req, res, next) => {
    logger.error("Unhandled error", err);
    if (!isSpecPath(req.path)) {
      return res.status(500).json({ message: "Internal error" });
    }
    return res
      .status(200)
      .json(
        failure(req.body?.requestId, req.body?.msisdn, toAppError(err))
      );
  });

  return app;
}
