import { Router } from "express";
import { balanceUsage } from "../controllers/balanceUsageController.js";
import { usageHistory } from "../controllers/usageHistoryController.js";
import { planDetails } from "../controllers/planDetailsController.js";
import { rechargeSendLink } from "../controllers/rechargeLinkController.js";
import { rechargeDetails } from "../controllers/rechargeDetailsController.js";
import { planSendDetails } from "../controllers/planSendDetailsController.js";
import { planRecommendations } from "../controllers/planRecommendationsController.js";
import { planSendChangeLink } from "../controllers/planChangeLinkController.js";
import { notificationSend } from "../controllers/notificationController.js";
import { ticketCreate } from "../controllers/ticketCreateController.js";
import { serviceSendDeactivationLink } from "../controllers/serviceDeactivationController.js";
import { simStatus } from "../controllers/simStatusController.js";
import { requireApiKey } from "../middleware/apiKeyAuth.js";
import { failure } from "../utils/envelope.js";
import { badRequest } from "../utils/errors.js";

/**
 * The documented endpoints, mounted at exactly the paths in the spec:
 *   POST /account/balance_usage   (UC1 Branch A)
 *   POST /account/usage_history   (UC1 Branch B)
 *   POST /account/plan_details    (UC1 Branch C, extended for UC3 Branch A)
 *   POST /recharge/send_link      (UC2 Branch A)
 *   POST /recharge/details        (UC2 Branch B, reused by UC2 Branch C and UC3 Branch B)
 *   POST /plan/send_details       (UC3 Branch A)
 *   POST /plan/recommendations    (UC3 Branch B)
 *   POST /plan/send_change_link   (UC3 Branch B)
 *   POST /notification/send       (UC3 Branch B)
 *   POST /service/send_deactivation_link (UC4 Branch 2)
 *   POST /sim/status               (UC4 Branch 3)
 *   POST /ticket/create           (shared)
 */
const router = Router();

/** Paths that must answer with the SUCCESS/FAILURE envelope, never a bare HTTP error. */
export const SPEC_PATHS = [
  "/account/balance_usage",
  "/account/usage_history",
  "/account/plan_details",
  "/recharge/send_link",
  "/recharge/details",
  "/plan/send_details",
  "/plan/recommendations",
  "/plan/send_change_link",
  "/service/send_deactivation_link",
  "/sim/status",
  "/notification/send",
  "/ticket/create",
];

export const isSpecPath = (path) => SPEC_PATHS.includes(path);

/**
 * A wrong Content-Type means express.json() silently left the body empty, which
 * would otherwise surface as a confusing "requestId is required".
 */
function requireJsonContentType(req, res, next) {
  if (!req.is("application/json")) {
    return res.status(200).json(
      failure(
        undefined,
        undefined,
        badRequest("Content-Type must be application/json")
      )
    );
  }
  return next();
}

// requireApiKey first: an unauthorised caller learns nothing about their request.
router.post(
  "/account/balance_usage",
  requireApiKey,
  requireJsonContentType,
  balanceUsage
);
router.post(
  "/account/usage_history",
  requireApiKey,
  requireJsonContentType,
  usageHistory
);
router.post(
  "/account/plan_details",
  requireApiKey,
  requireJsonContentType,
  planDetails
);
router.post(
  "/recharge/send_link",
  requireApiKey,
  requireJsonContentType,
  rechargeSendLink
);
router.post(
  "/recharge/details",
  requireApiKey,
  requireJsonContentType,
  rechargeDetails
);
router.post(
  "/plan/send_details",
  requireApiKey,
  requireJsonContentType,
  planSendDetails
);
router.post(
  "/plan/recommendations",
  requireApiKey,
  requireJsonContentType,
  planRecommendations
);
router.post(
  "/plan/send_change_link",
  requireApiKey,
  requireJsonContentType,
  planSendChangeLink
);
router.post(
  "/service/send_deactivation_link",
  requireApiKey,
  requireJsonContentType,
  serviceSendDeactivationLink
);
router.post(
  "/sim/status",
  requireApiKey,
  requireJsonContentType,
  simStatus
);
router.post(
  "/notification/send",
  requireApiKey,
  requireJsonContentType,
  notificationSend
);
router.post(
  "/ticket/create",
  requireApiKey,
  requireJsonContentType,
  ticketCreate
);

export { router as specRoutes };
