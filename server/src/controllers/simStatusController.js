import { getSimStatus } from "../services/simStatusService.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { validateSimStatusRequest } from "../validation/simStatusRequest.js";
import { logger } from "../utils/logger.js";

/**
 * POST /sim/status  (UC4 Branch 3)
 *
 * Always HTTP 200 — SUCCESS or FAILURE lives in the body.
 */
export async function simStatus(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;

  try {
    const request = validateSimStatusRequest(req.body);
    const payload = await getSimStatus(request);

    logger.info(
      `sim_status SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} validity=${payload.validity.type}`
    );
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to check SIM status");
    if (!err.code) logger.error("sim_status unexpected error", err);
    logger.warn(
      `sim_status FAILURE requestId=${rawRequestId} code=${appError.code} message=${appError.message}`
    );
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
