// Delivery recommendation — urgency asks "does this matter", this asks
// "should anything be interrupted, where, and in what format".
//
// Only "today" is live. Every other channel is a documented seam: nothing in
// this phase can route to phone, wearable, voice or ambient, and the evaluator
// never tries.
import { type Urgency, urgencyRank } from "./urgency.ts";

export type CommunicationChannel =
  | "silent"
  | "today"
  | "phone"
  | "wearable"
  | "voice"
  | "ambient";

export type CommunicationFormat = "summary" | "short" | "urgent";

/**
 * Channels available with no extra consent. "phone" becomes live only when the
 * user has opted into push AND a registered device exists — see liveChannels().
 */
export const LIVE_CHANNELS: CommunicationChannel[] = ["silent", "today"];

/**
 * Context the ladder can read. Activity detection is still future work; the
 * only populated fields today are the push ones, and both are hard consent
 * gates rather than heuristics.
 */
export type DeliveryContext = {
  deskActive?: boolean;
  phoneActive?: boolean;
  moving?: boolean;
  driving?: boolean;
  training?: boolean;
  focusMode?: boolean;
  sleeping?: boolean;
  earbudsConnected?: boolean;
  wearableAvailable?: boolean;
  /** User turned "reach my phone" on in settings. */
  pushOptIn?: boolean;
  /** At least one live push subscription exists for this user. */
  pushSubscribed?: boolean;
};

/** Channels usable for this context. Push is additive and consent-gated. */
export function liveChannels(ctx: DeliveryContext = {}): CommunicationChannel[] {
  const pushReady = ctx.pushOptIn === true && ctx.pushSubscribed === true;
  return pushReady ? [...LIVE_CHANNELS, "phone"] : [...LIVE_CHANNELS];
}

export type DeliveryRecommendation = {
  recommendedChannel: CommunicationChannel;
  recommendedFormat: CommunicationFormat;
  /** Channel the ladder would allow once future channels are live. */
  futureChannel: CommunicationChannel;
  live: boolean;
};

/**
 * The priority ladder. Background/useful stay silent; attention is Today.
 * Time-sensitive and critical reach the phone only when push is opted into and
 * a device is registered — otherwise they stay clamped to Today. Voice,
 * wearable and ambient remain seams.
 */
export function recommendDelivery(
  urgency: Urgency,
  ctx: DeliveryContext = {},
): DeliveryRecommendation {
  const futureChannel: CommunicationChannel =
    urgency === "critical" ? "ambient"
    : urgency === "time_sensitive" ? "phone"
    : urgency === "attention" ? "today"
    : "silent";

  const format: CommunicationFormat =
    urgency === "critical" ? "urgent"
    : urgency === "time_sensitive" ? "short"
    : "summary";

  const available = liveChannels(ctx);
  const wantsReach = urgencyRank(urgency) >= urgencyRank("time_sensitive");
  const channel: CommunicationChannel =
    wantsReach && available.includes("phone") ? "phone"
    : urgencyRank(urgency) >= urgencyRank("attention") ? "today"
    : "silent";

  return {
    recommendedChannel: channel,
    recommendedFormat: format,
    futureChannel,
    live: available.includes(channel),
  };
}

