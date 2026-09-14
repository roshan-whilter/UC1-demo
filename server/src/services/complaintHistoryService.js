import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { internal, notFound } from "../utils/errors.js";

const digits = (value) => value.replace(/\D/g, "");

export async function getComplaintHistory({ msisdn }) {
  if (config.forceComplaintHistoryErrorMsisdns.some((entry) => digits(entry) === digits(msisdn))) {
    throw internal("Complaint history service unavailable");
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) throw notFound();

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    complaints: (subscriber.complaints ?? []).map((caseRecord) => ({
      caseId: caseRecord.caseId,
      type: caseRecord.type,
      category: caseRecord.category,
      status: caseRecord.status,
      summary: caseRecord.summary,
      createdAt: caseRecord.createdAt,
      lastUpdatedAt: caseRecord.lastUpdatedAt,
      expectedResolutionAt: caseRecord.expectedResolutionAt,
    })),
  };
}
