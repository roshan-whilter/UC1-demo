import {
  requireObjectBody,
  requireString,
  requireTimestamp,
  requireMsisdn,
} from "./validators.js";
import { badRequest } from "../utils/errors.js";

export const TROUBLESHOOTING_ISSUE_TYPES = [
  "MOBILE_DATA",
  "VOICE_CALLS",
  "SMS",
  "NETWORK",
];

export function validateTroubleshootingLinkRequest(body) {
  requireObjectBody(body);
  const requestId = requireString(body, "requestId");
  const timestamp = requireTimestamp(body);
  const msisdn = requireMsisdn(body);
  const issueType = requireString(body, "issueType");

  if (!TROUBLESHOOTING_ISSUE_TYPES.includes(issueType)) {
    throw badRequest(
      `issueType must be one of: ${TROUBLESHOOTING_ISSUE_TYPES.join(", ")}`
    );
  }

  return { requestId, timestamp, msisdn, issueType };
}
