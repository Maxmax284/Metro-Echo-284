// watchIntent — the words-to-watch layer, shared by Ask, Telegram and the app.
//
// There is exactly one watch object. This module only decides:
//   - which kind of thing the person means,
//   - what the watch should be called in their own words,
//   - which open watch they mean when they say stop,
//   - and what Echo says back.
//
// Pure: no IO, no Deno globals, no provider calls. Both surfaces do their own
// tiny bit of reading and writing around it, so nothing here can execute
// anything or start a second engine.

import type { WatchKind, WatchState } from "./watch.ts";
import { OPEN_STATES } from "./watch.ts";

export type WatchSubjectHint = "action" | "calendar_event" | "unknown";

const CALENDAR_WORDS = [
  "appointment",
  "meeting",
  "flight",
  "calendar",
  "event",
  "booking",
  "reservation",
  "check-in",
  "checkin",
  "class",
  "session",
  "call",
  "hotel",
  "stay",
];

const ACTION_WORDS = ["payment", "deposit", "transfer", "invoice", "approval", "change", "request", "move", "invite"];

/** Which kind of thing the person is pointing at, from their own words. */
export function inferWatchKind(words: string): WatchSubjectHint {
  const text = words.toLowerCase();
  const calendar = CALENDAR_WORDS.some((w) => text.includes(w));
  const action = ACTION_WORDS.some((w) => text.includes(w));
  if (calendar && !action) return "calendar_event";
  if (action && !calendar) return "action";
  if (calendar && action) return "calendar_event";
  return "unknown";
}

/** True when the sentence is asking Echo to keep going, not to do something now. */
export function isWatchRequest(words: string): boolean {
  const t = words.toLowerCase();
  return (
    /keep (an )?eye on/.test(t) ||
    /\bwatch (this|that|it|the )/.test(t) ||
    /keep checking/.test(t) ||
    /let me know if .*(moves|changes|lands|is removed|gets cancelled)/.test(t) ||
    /tell me if .*(moves|changes|lands|is removed|gets cancelled)/.test(t)
  );
}

/** True when the sentence is asking Echo to stop. */
export function isStopWatchRequest(words: string): boolean {
  const t = words.toLowerCase();
  return /stop (watching|keeping an eye|checking)/.test(t) || /(forget|drop) (watching|that watch)/.test(t);
}

/** The goal line a person reads on the card in Work → In motion. */
export function watchGoal(reference: string, kind: WatchKind): string {
  const ref = reference.trim().replace(/\s+/g, " ") || "this";
  return kind === "calendar_event"
    ? `Tell me if ${ref} moves or disappears.`
    : `Keep checking ${ref} until it settles.`;
}

/** How often to look, from the person's own urgency words. */
export function watchCadenceMinutes(words: string): number {
  const t = words.toLowerCase();
  if (/(right away|urgent|closely|every few minutes)/.test(t)) return 10;
  if (/(hourly|every hour)/.test(t)) return 60;
  if (/(daily|each day|every day)/.test(t)) return 720;
  return 30;
}

/** How long Echo is allowed to keep going before it gives up on its own. */
export function watchStopAt(now: Date, words: string): string {
  const t = words.toLowerCase();
  const days = /(month|weeks)/.test(t) ? 30 : /(week)/.test(t) ? 7 : /(today|tonight)/.test(t) ? 1 : 7;
  return new Date(now.getTime() + days * 86_400_000).toISOString();
}

export type OpenWatchShape = { id: string; goal: string; state: WatchState; created_at?: string };

export type WatchMatch =
  | { status: "none" }
  | { status: "one"; watch: OpenWatchShape }
  | { status: "many"; candidates: OpenWatchShape[] };

/** Which open watch the person means. No reference at all means the newest one. */
export function matchOpenWatch(rows: OpenWatchShape[], reference: string): WatchMatch {
  const open = rows.filter((r) => OPEN_STATES.includes(r.state));
  if (open.length === 0) return { status: "none" };
  const words = reference.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const vague = words.length === 0 || words.every((w) => ["this", "that", "the", "one", "watch", "stop", "watching", "it"].includes(w));
  if (vague) return open.length === 1 ? { status: "one", watch: open[0] } : { status: "many", candidates: open.slice(0, 5) };

  const scored = open
    .map((r) => ({ r, score: words.filter((w) => r.goal.toLowerCase().includes(w)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return { status: "none" };
  if (scored.length > 1 && scored[0].score === scored[1].score) {
    return { status: "many", candidates: scored.slice(0, 5).map((s) => s.r) };
  }
  return { status: "one", watch: scored[0].r };
}

/* ------------------------------------------------------------------ replies */

export function watchStartedReply(goal: string, cadenceMinutes: number): string {
  const how = cadenceMinutes <= 10
    ? "I'll look every few minutes"
    : cadenceMinutes <= 60
      ? "I'll look about once an hour"
      : "I'll look a couple of times a day";
  return `On it. ${goal} ${how}, and I'll only come back when something actually changes. It's in Work under In motion if you want to stop it.`;
}

export function watchNeedsSubjectReply(kind: WatchSubjectHint): string {
  return kind === "calendar_event"
    ? "Which entry do you mean? Give me the name or the day and I'll keep an eye on it."
    : "Which one do you mean? Name it and I'll keep checking until it settles.";
}

export function watchStoppedReply(goal: string): string {
  return `Done, I've stopped that one. ${goal}`;
}

export function watchStopAmbiguousReply(candidates: OpenWatchShape[]): string {
  return `I'm keeping an eye on a few things. Which one? ${candidates.map((c) => c.goal).join(" · ")}`;
}

export function watchNothingOpenReply(): string {
  return "I'm not watching anything right now, so there's nothing to stop.";
}

/** The status read, using only recorded state. */
export function watchStatusReply(rows: (OpenWatchShape & { outcome?: string | null })[]): string {
  const open = rows.filter((r) => OPEN_STATES.includes(r.state));
  if (open.length === 0) return "Nothing on watch at the moment.";
  const lines = open.slice(0, 5).map((r) => `• ${r.goal}${r.outcome ? ` — ${r.outcome}` : ""}`);
  return `Still on it:\n${lines.join("\n")}`;
}
