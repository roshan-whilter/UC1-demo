import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { ServiceDeactivationLink } from "../models/ServiceDeactivationLink.js";
import { nextSequence } from "../models/Counter.js";
import {
  notFound,
  internal,
  serviceNotActive,
  AppError,
} from "../utils/errors.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceServiceDeactivationErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /service/send_deactivation_link.
 */
export async function sendServiceDeactivationLink({ requestId, msisdn, serviceId }) {
  if (isForcedError(msisdn)) {
    throw internal("Service deactivation gateway unavailable");
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const activeService = (subscriber.services ?? []).find(
    (entry) => entry.serviceId === serviceId
  );
  if (!activeService) {
    throw serviceNotActive(`${serviceId} is not an active service for this subscriber`);
  }

  const now = new Date();
  const day = formatDate(now);
  const sentAt = formatTimestamp(now);
  const expiresAt = formatTimestamp(
    new Date(now.getTime() + 24 * 3600000)
  );

  const resendCount = await ServiceDeactivationLink.countDocuments({
    msisdn: subscriber.msisdn,
    day,
  });

  let saved;
  try {
    const seq = String(await nextSequence(`service_deactivation:${day}`)).padStart(4, "0");
    const reference = `DAC-${day}-${seq}`;
    const messageId = `SMS-DAC-${day}-${seq}`;

    saved = await ServiceDeactivationLink.create({
      reference,
      messageId,
      msisdn: subscriber.msisdn,
      to: subscriber.msisdn,
      channel: "SMS",
      status: "SENT",
      serviceId: activeService.serviceId,
      serviceName: activeService.name,
      ussdCode: "*123*4*1#",
      url: `${config.rechargeLinkBaseUrl.replace("/recharge", "/deactivate")}?ref=${reference}&service=${activeService.serviceId}`,
      sentAt,
      expiresAt,
      requestId,
      day,
    });
  } catch (err) {
    throw new AppError("500", "Unable to send deactivation link");
  }

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    message: {
      messageId: saved.messageId,
      channel: saved.channel,
      to: saved.to,
      status: saved.status,
      sentAt: saved.sentAt,
      resendCount,
    },
    deactivation: {
      serviceId: saved.serviceId,
      serviceName: saved.serviceName,
      ussdCode: saved.ussdCode,
      link: {
        reference: saved.reference,
        url: saved.url,
        expiresAt: saved.expiresAt,
      },
    },
  };
}
