import { Router } from "express";
import mongoose from "mongoose";
import { config } from "../config/env.js";
import { requireApiKey } from "../middleware/apiKeyAuth.js";
import {
  listSubscribers,
  addSubscriber,
  ValidationError,
} from "../services/subscriberService.js";
import { listTickets } from "../services/ticketService.js";
import { listRechargeLinks } from "../services/rechargeLinkService.js";
import { listPlanMessages } from "../services/planMessageService.js";
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

/**
 * Add a subscriber to a running instance, so testers can put their own numbers
 * in without a redeploy. Only msisdn and name are required.
 *
 * Ordinary HTTP codes here (201/200/400), like the rest of /demo — the
 * SUCCESS/FAILURE envelope belongs to the two spec endpoints.
 */
router.post("/subscribers", async (req, res) => {
  try {
    const { created, subscriber } = await addSubscriber(req.body);
    logger.info(
      `demo/subscribers ${created ? "created" : "updated"} ${subscriber.msisdn} (${subscriber.name})`
    );
    res.status(created ? 201 : 200).json({
      message: created ? "Subscriber added" : "Subscriber updated",
      subscriber,
    });
  } catch (err) {
    if (err instanceof ValidationError) {
      return res.status(400).json({ message: err.message });
    }
    logger.error("demo/subscribers add failed", err);
    res.status(500).json({ message: "Unable to add subscriber" });
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

router.get("/recharge_links", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    res.status(200).json({
      rechargeLinks: await listRechargeLinks(
        Number.isFinite(limit) ? limit : 20
      ),
    });
  } catch (err) {
    logger.error("demo/recharge_links failed", err);
    res.status(500).json({ message: "Unable to list recharge links" });
  }
});

router.get("/plan_messages", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 20);
    res.status(200).json({
      planMessages: await listPlanMessages(
        Number.isFinite(limit) ? limit : 20
      ),
    });
  } catch (err) {
    logger.error("demo/plan_messages failed", err);
    res.status(500).json({ message: "Unable to list plan messages" });
  }
});

export { router as demoRoutes };
