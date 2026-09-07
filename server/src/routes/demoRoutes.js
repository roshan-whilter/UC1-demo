import { Router } from "express";
import mongoose from "mongoose";
import { config } from "../config/env.js";
import { requireApiKey } from "../middleware/apiKeyAuth.js";
import { listSubscribers } from "../services/subscriberService.js";
import { listTickets } from "../services/ticketService.js";
import { logger } from "../utils/logger.js";

/**
 * NOT part of the UC1 spec. These exist only so the React console can show what
 * is seeded and what has been raised. Mounted under /demo so they can never be
 * mistaken for the two documented endpoints, and they use ordinary HTTP codes.
 */
const router = Router();

/**
 * The only unauthenticated route, so uptime monitors and deploy health checks
 * work without holding a key. It deliberately reveals nothing but liveness —
 * no subscriber data, no configuration.
 */
router.get("/health", (req, res) => {
  res.status(200).json({
    service: "uc1-demo-mock-api",
    status: "UP",
    mongo:
      mongoose.connection.readyState === 1 ? "CONNECTED" : "DISCONNECTED",
    uptimeSeconds: Math.round(process.uptime()),
  });
});

// Everything below returns real customer-shaped data, so it needs a key too.
router.use(requireApiKey);

router.get("/subscribers", async (req, res) => {
  try {
    const subscribers = await listSubscribers();
    res.status(200).json({
      subscribers,
      forcedFailureMsisdns: {
        balanceUsage: config.forceBalanceErrorMsisdns,
        ticketCreate: config.forceTicketErrorMsisdns,
      },
    });
  } catch (err) {
    logger.error("demo/subscribers failed", err);
    res.status(500).json({ message: "Unable to list subscribers" });
  }
});

router.get("/tickets", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    res.status(200).json({
      tickets: await listTickets(Number.isFinite(limit) ? limit : 20),
    });
  } catch (err) {
    logger.error("demo/tickets failed", err);
    res.status(500).json({ message: "Unable to list tickets" });
  }
});

export { router as demoRoutes };
