import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { TroubleshootingLink } from "../models/TroubleshootingLink.js";
import { nextSequence } from "../models/Counter.js";
import { formatDate, formatTimestamp } from "../utils/timestamp.js";
import { AppError, internal, notFound } from "../utils/errors.js";

const digits = (value) => value.replace(/\D/g, "");

export async function sendTroubleshootingLink({ requestId, msisdn, issueType }) {
  if (config.forceTroubleshootingSmsErrorMsisdns.some((entry) => digits(entry) === digits(msisdn))) {
    throw internal("SMS gateway unavailable");
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) throw notFound();

  const now = new Date();
  const day = formatDate(now);
  const sentAt = formatTimestamp(now);
  const expiresAt = formatTimestamp(
    new Date(now.getTime() + config.troubleshootingLinkTtlHours * 3600000)
  );
  const resendCount = await TroubleshootingLink.countDocuments({
    msisdn: subscriber.msisdn,
    day,
  });

  let saved;
  try {
    const sequence = String(await nextSequence(`troubleshooting:${day}`)).padStart(4, "0");
    const reference = `OUT-${day}-${sequence}`;
    saved = await TroubleshootingLink.create({
      reference,
      messageId: `SMS-OUT-${day}-${sequence}`,
      msisdn: subscriber.msisdn,
      to: subscriber.msisdn,
      channel: "SMS",
      status: "SENT",
      issueType,
      stepsReference: `TS-${issueType}-001`,
      url: `${config.troubleshootingLinkBaseUrl}?ref=${reference}&issue=${issueType}`,
      sentAt,
      expiresAt,
      requestId,
      day,
    });
  } catch {
    throw new AppError("500", "Unable to send troubleshooting link");
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
    troubleshooting: {
      issueType: saved.issueType,
      stepsReference: saved.stepsReference,
      link: {
        reference: saved.reference,
        url: saved.url,
        expiresAt: saved.expiresAt,
      },
    },
  };
}

export async function listTroubleshootingLinks(limit = 20) {
  return TroubleshootingLink.find({}, { _id: 0, __v: 0 })
    .sort({ sentAt: -1, reference: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .lean();
}
