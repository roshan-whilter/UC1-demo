import { Router } from "express";
import { balanceUsage } from "../controllers/balanceUsageController.js";
import { usageHistory } from "../controllers/usageHistoryController.js";
import { planDetails } from "../controllers/planDetailsController.js";
import { ticketCreate } from "../controllers/ticketCreateController.js";
import { requireApiKey } from "../middleware/apiKeyAuth.js";
import { failure } from "../utils/envelope.js";
import { badRequest } from "../utils/errors.js";

/**
 * The documented endpoints, mounted at exactly the paths in the spec:
 *   POST /account/balance_usage   (Branch A)
 *   POST /account/usage_history   (Branch B)
 *   POST /account/plan_details    (Branch C)
 *   POST /ticket/create           (shared)
 */
const router = Router();

/** Paths that must answer with the SUCCESS/FAILURE envelope, never a bare HTTP error. */
export const SPEC_PATHS = [
  "/account/balance_usage",
  "/account/usage_history",
  "/account/plan_details",
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
  "/ticket/create",
  requireApiKey,
  requireJsonContentType,
  ticketCreate
);

export { router as specRoutes };
