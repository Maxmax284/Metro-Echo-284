// Inbound notice — the on-screen half of reach.
//
// Before this module, a signed signal from a first-party system (LMT Camp State,
// CampCore, Fenrir, a public form) could reach Telegram and land in the arrivals
// list, and that was it. Someone with Telegram off, or no linked chat, got a
// quiet line in a list for a failed payment. That is plumbing, not consequence.
//
// So: a signal that already earns an interruption also earns one line in Today.
// Same threshold as messaging (time-sensitive and above), same dedupe identity
// (the sender's idempotency key), so app + Telegram are one notice on two
// surfaces, never two notices.
//
// Pure module. No IO, no gateway, no execution. It decides wording and weight.
import { urgencyRank, type Urgency } from "./urgency.ts";
import type { SignalDetail } from "./inbound.ts";

/** The one registered kind every first-party signal notice uses. */
export const INBOUND_NOTICE_KIND = "inbound_needs_you";

/** Today shows it when messaging would have said it out loud. */
export function shouldRaiseNotice(urgency: Urgency): boolean {
  return urgencyRank(urgency) >= urgencyRank("time_sensitive");
}

/** Weight inside the attention budget. Critical outranks a booked collision. */
export function noticePriority(urgency: Urgency): number {
  return urgency === "critical" ? 85 : 70;
}

/**
 * One notice per signal, whatever surface saw it first. The sender's
 * idempotency key is the identity — a retried webhook cannot stack notices.
 */
export function noticeDedupeKey(idempotencyKey: string): string {
  return `reach.inbound:${idempotencyKey}`;
}

/** Headline stays the platform's own plain sentence. */
export function noticeTitle(detail: SignalDetail): string {
  return detail.title.slice(0, 200);
}

/**
 * Body says the concrete facts that arrived, where the thing is, and — plainly —
 * that nothing was done about it. Never invents a fact the payload lacked.
 */
export function noticeBody(
  detail: SignalDetail,
  opts: { displayName: string; alsoSentToMessaging?: boolean } = { displayName: "A connected system" },
): string {
  const facts = detail.lines.slice(0, 3);
  const parts = [
    `From ${opts.displayName}.`,
    ...facts,
    "It is in your inbox for review. Nothing was actioned.",
  ];
  if (opts.alsoSentToMessaging) parts.push("Also sent to Telegram.");
  return parts.join(" ");
}
