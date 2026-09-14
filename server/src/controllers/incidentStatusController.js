import { getIncidentStatus } from "../services/incidentStatusService.js";
import { validateIncidentStatusRequest } from "../validation/incidentStatusRequest.js";
import { success, failure } from "../utils/envelope.js";
import { toAppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export async function incidentStatus(req, res) {
  const rawRequestId = req.body?.requestId;
  const rawMsisdn = req.body?.msisdn;
  try {
    const request = validateIncidentStatusRequest(req.body);
    const payload = await getIncidentStatus(request);
    logger.info(`incident_status SUCCESS requestId=${request.requestId} msisdn=${request.msisdn} found=${payload.incident.found}`);
    return res.status(200).json(success(request.requestId, payload));
  } catch (err) {
    const appError = toAppError(err, "Unable to check incident status");
    if (!err.code) logger.error("incident_status unexpected error", err);
    return res.status(200).json(failure(rawRequestId, rawMsisdn, appError));
  }
}
