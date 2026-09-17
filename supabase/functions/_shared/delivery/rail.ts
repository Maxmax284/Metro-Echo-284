// delivery/rail — one event, one judgment, one delivery, one receipt.
//
// Doctrine:
//   - Every sweep that wants to reach a person comes through here. Before this
//     module, each sweep fetched subscriptions, sent its own push, cleaned up
//     its own 404s and had no idea Telegram had already said the same thing.
//   - One event produces one dedupe key. A second surface only happens when the
//     first one failed, or when the situation is critical.
//   - Quiet hours, attention budget and suppression are CALLED, never rewritten.
//     This module decides where, not whether.
//   - Push copy is a conclusion, not telemetry. Sensitive domains get privacy-
//     safe wording on the lock screen by default.
//   - Nothing consequential is ever executed from a notification. The deep link
//     opens the exact situation inside Metro Echo and the person decides there.
//
// Pure module: it plans a delivery and words it. The caller does the IO.

import { type Urgency, urgencyRank } from "../awareness/urgency.ts";
import {
  type CommunicationChannel,
  type DeliveryContext,
  liveChannels,
} from "../awareness/deliver.ts";

/** What kind of content this is. Drives lock-screen privacy, nothing else. */
export type Sensitivity = "ordinary" | "sensitive";

export type SituationRef = {
  /** Stable id of the underlying situation record (nudge, flight, commitment). */
  id: string;
  /** What kind of thing it is, in internal words. */
  kind: string;
  /** Where in Metro Echo this situation lives. */
  url: string;
};

export type DeliveryRequest = {
  situation: SituationRef;
  urgency: Urgency;
  sensitivity: Sensitivity;
  /** The conclusion, first. Six to nine words is plenty. */
  headline: string;
  /** One line of why, optional. Never telemetry. */
  detail?: string | null;
  /** What actually changed, used for the dedupe key. */
  changeKey: string;
  context: DeliveryContext;
  /** Reads already sent for this situation, newest first. */
  prior?: Array<{ dedupeKey: string; surface: DeliverySurface; sentAt: string; ok: boolean }>;
};

export type DeliverySurface = "today" | "phone" | "messaging" | "silent";

/** Low-consequence only. Nothing here approves, sends, buys or cancels. */
export type NotificationAction = "view" | "later" | "got_it" | "review" | "stop_watching";

export const ACTION_WORDS: Record<NotificationAction, string> = {
  view: "View",
  later: "Later",
  got_it: "Got it",
  review: "Review",
  stop_watching: "Stop watching",
};

/** Which status a tapped action writes on the underlying situation. */
export const ACTION_STATUS: Record<NotificationAction, "seen" | "snoozed" | "acted" | "muted"> = {
  view: "seen",
  later: "snoozed",
  got_it: "acted",
  review: "seen",
  stop_watching: "muted",
};

export type DeliveryPlan = {
  surface: DeliverySurface;
  dedupeKey: string;
  /** Why this surface, in internal words. Goes on the receipt. */
  because: string;
  /** Words for the surface that was chosen. */
  title: string;
  body: string;
  /** Lock-screen safe wording, used when the device may show a preview. */
  lockScreenBody: string;
  url: string;
  actions: NotificationAction[];
  /** Surface to try if this one fails. Null when there is nothing honest to fall back to. */
  fallback: DeliverySurface | null;
  /** True when the plan is a repeat of something already delivered. */
  duplicate: boolean;
};

/** One event, one key. Same situation plus same change equals same key. */
export function dedupeKey(situation: SituationRef, changeKey: string): string {
  return `${situation.kind}:${situation.id}:${changeKey}`;
}

/**
 * Surface order: reach the phone first when a person asked to be reachable,
 * then Telegram, then Today, then silence. Consent gates come from liveChannels.
 */
function pickSurface(req: DeliveryRequest): { surface: DeliverySurface; because: string } {
  const available = liveChannels(req.context);
  const has = (c: CommunicationChannel) => available.includes(c);
  const wantsReach = urgencyRank(req.urgency) >= urgencyRank("time_sensitive");
  const quiet = req.context.sleeping === true;

  if (wantsReach && quiet && req.urgency !== "critical") {
    return { surface: "today", because: "quiet hours hold anything short of critical" };
  }
  if (wantsReach && has("phone")) return { surface: "phone", because: "time-sensitive and the phone is opted in" };
  if (wantsReach && has("messaging")) return { surface: "messaging", because: "time-sensitive and Telegram is linked" };
  if (urgencyRank(req.urgency) >= urgencyRank("attention")) {
    return { surface: "today", because: "worth attention, not worth an interruption" };
  }
  return { surface: "silent", because: "nothing here earns an interruption" };
}

function fallbackFor(surface: DeliverySurface, req: DeliveryRequest): DeliverySurface | null {
  const available = liveChannels(req.context);
  if (surface === "phone") return available.includes("messaging") ? "messaging" : "today";
  if (surface === "messaging") return "today";
  return null;
}

function actionsFor(req: DeliveryRequest, surface: DeliverySurface): NotificationAction[] {
  if (surface === "silent" || surface === "today") return [];
  const base: NotificationAction[] = ["view"];
  if (urgencyRank(req.urgency) >= urgencyRank("time_sensitive")) base.push("later");
  else base.push("got_it");
  if (req.situation.kind.startsWith("flight") || req.situation.kind.startsWith("watch")) base.push("stop_watching");
  return base.slice(0, 3);
}

/** Sensitive content says that something needs them, not what it is. */
export function lockScreenWords(req: DeliveryRequest): string {
  if (req.sensitivity === "ordinary") return req.detail?.trim() || req.headline;
  return "Something needs you. Open Metro Echo to read it.";
}

export function planDelivery(req: DeliveryRequest): DeliveryPlan {
  const key = dedupeKey(req.situation, req.changeKey);
  const already = (req.prior ?? []).find((p) => p.dedupeKey === key && p.ok);
  const { surface, because } = pickSurface(req);

  if (already) {
    return {
      surface: "silent",
      dedupeKey: key,
      because: `already delivered on ${already.surface}; one event gets one delivery`,
      title: req.headline,
      body: req.detail?.trim() || "",
      lockScreenBody: lockScreenWords(req),
      url: req.situation.url,
      actions: [],
      fallback: null,
      duplicate: true,
    };
  }

  return {
    surface,
    dedupeKey: key,
    because,
    title: req.headline,
    body: req.detail?.trim() || "",
    lockScreenBody: lockScreenWords(req),
    url: req.situation.url,
    actions: actionsFor(req, surface),
    fallback: fallbackFor(surface, req),
    duplicate: false,
  };
}

/** The push payload, once a plan says phone. Actions are low-consequence only. */
export function pushPayload(plan: DeliveryPlan): {
  title: string;
  body: string;
  url: string;
  tag: string;
  data: { situationUrl: string; dedupeKey: string };
  actions: Array<{ action: NotificationAction; title: string }>;
} {
  return {
    title: plan.title,
    body: plan.lockScreenBody,
    url: plan.url,
    tag: plan.dedupeKey,
    data: { situationUrl: plan.url, dedupeKey: plan.dedupeKey },
    actions: plan.actions.map((a) => ({ action: a, title: ACTION_WORDS[a] })),
  };
}

/** The receipt line for a delivery. Every reach leaves one. */
export function deliveryReceipt(plan: DeliveryPlan, ok: boolean): string {
  if (plan.surface === "silent") return `Said nothing: ${plan.because}.`;
  const where = plan.surface === "phone" ? "your phone" : plan.surface === "messaging" ? "Telegram" : "Today";
  return ok ? `Reached ${where}: ${plan.because}.` : `Tried ${where} and it failed: ${plan.because}.`;
}
