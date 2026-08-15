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

/** Channels this phase is allowed to use. Do not widen without a phase. */
export const LIVE_CHANNELS: CommunicationChannel[] = ["silent", "today"];

/**
 * Future context object. Not populated in this phase — the seam exists so
 * activity detection can arrive later without reshaping the pipeline.
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
};

export type DeliveryRecommendation = {
  recommendedChannel: CommunicationChannel;
  recommendedFormat: CommunicationFormat;
  /** Channel the ladder would allow once future channels are live. */
  futureChannel: CommunicationChannel;
  live: boolean;
};

/**
 * The priority ladder. Background/useful stay silent; attention is Today;
 * time-sensitive and critical would earn more reach in future phases but are
 * clamped to Today today.
 */
export function recommendDelivery(
  urgency: Urgency,
  _ctx: DeliveryContext = {},
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

  const channel: CommunicationChannel =
    urgencyRank(urgency) >= urgencyRank("attention") ? "today" : "silent";

  return {
    recommendedChannel: channel,
    recommendedFormat: format,
    futureChannel,
    live: LIVE_CHANNELS.includes(channel),
  };
}
