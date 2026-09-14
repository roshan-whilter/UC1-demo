import { config } from "../config/env.js";
import { findSubscriber } from "./subscriberService.js";
import { notFound, internal } from "../utils/errors.js";

const lookupKey = (msisdn) => msisdn.replace(/\D/g, "");

const isForcedError = (msisdn) =>
  config.forceSimStatusErrorMsisdns.some(
    (entry) => lookupKey(entry) === lookupKey(msisdn)
  );

/**
 * Builds the SUCCESS payload for POST /sim/status.
 */
export async function getSimStatus({ msisdn }) {
  if (isForcedError(msisdn)) {
    throw internal("SIM validity service unavailable");
  }

  const subscriber = await findSubscriber(msisdn);
  if (!subscriber) {
    throw notFound();
  }

  const validity = subscriber.validity ?? {
    type: "FULL",
    expiryDate: subscriber.data?.expiry ?? "00000000",
  };

  return {
    subscriber: {
      msisdn: subscriber.msisdn,
      name: subscriber.name,
      type: subscriber.type,
    },
    validity: {
      type: validity.type,
      expiryDate: validity.expiryDate,
    },
  };
}
