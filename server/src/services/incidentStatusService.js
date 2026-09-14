import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { internal, notFound } from "../utils/errors.js";

const digits = (value) => value.replace(/\D/g, "");

export async function getIncidentStatus({ msisdn }) {
  if (config.forceIncidentStatusErrorMsisdns.some((entry) => digits(entry) === digits(msisdn))) {
    throw internal("Incident status service unavailable");
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) throw notFound();

  const incident = subscriber.incident ?? {
    found: false,
    incidentId: null,
    status: "NONE",
    title: null,
    summary: null,
    startedAt: null,
    expectedRestorationAt: null,
    lastUpdatedAt: null,
  };

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    incident: {
      found: incident.found,
      incidentId: incident.incidentId,
      status: incident.status,
      title: incident.title,
      summary: incident.summary,
      startedAt: incident.startedAt,
      expectedRestorationAt: incident.expectedRestorationAt,
      lastUpdatedAt: incident.lastUpdatedAt,
    },
  };
}
