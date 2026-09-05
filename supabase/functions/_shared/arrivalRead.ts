// arrivalRead — how one arrival is spoken about, wherever it is spoken about.
//
// Doctrine:
//   - three parts, always in the same order: the read (what this is and where
//     it came from), the summary (the thing itself, shortened, never invented),
//     and the next step (the one move a person can make).
//   - the summary is only ever the words that actually arrived. Nothing is
//     paraphrased here, because paraphrasing without a model would be a guess.
//   - nothing in here executes. The next step is always a human move.
//
// Pure module: no IO, no React. The Aware room and the Telegram reply both
// read from this, so an arrival never gets described two different ways.

import type { Arrival, ArrivalChannel } from "./messageLane.ts";

export type ArrivalRead = {
  /** One line: what landed, from where, and how fresh it is. */
  read: string;
  /** The arrival itself, trimmed to something a person can scan. */
  summary: string;
  /** The single next move, phrased as a person would say it. */
  nextStep: string;
};

function channelPhrase(c: ArrivalChannel): string {
  if (c === "telegram") return "Telegram";
  if (c === "email") return "email";
  if (c === "upload") return "a file you added";
  return "a channel";
}

function ageWords(at: string, now: number): string | null {
  const t = new Date(at).getTime();
  if (!Number.isFinite(t)) return null;
  const mins = Math.round((now - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function shorten(text: string, max = 180): string {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** What kind of thing this is, in words a person would use out loud. */
export function arrivalKind(a: Arrival): string {
  if (a.heardOrRead === "heard") return "A voice note";
  if (a.attachment) return "A file";
  if (a.channel === "upload") return "A capture";
  return "A message";
}

export function readArrival(a: Arrival, opts: { now?: number; reason?: string } = {}): ArrivalRead {
  const now = opts.now ?? Date.now();
  const age = ageWords(a.at, now);
  const from = a.from ? ` from ${a.from}` : "";
  const via = a.channel === "upload" ? " as a file you added" : ` over ${channelPhrase(a.channel)}`;

  const read = `${arrivalKind(a)} arrived${via}${from}${age ? `, ${age}` : ""}.`;

  const body = (a.text ?? "").replace(/\s+/g, " ").trim();
  const summary = a.attachment && !body
    ? `${a.attachment} — nothing has been read out of it yet.`
    : body
      ? shorten(body)
      : "Nothing came with it but the arrival itself.";

  const nextStep = a.tiedTo
    ? `File it under ${a.tiedTo}, or say where else it belongs.`
    : a.timeSensitive
      ? "Say when it needs answering, and Vanta will hold the time for you."
      : a.unfiled
        ? "Say where it belongs and it stops being loose."
        : "Nothing is needed. It is already filed.";

  return { read, summary, nextStep };
}

/** The Telegram-shaped version: three short lines, no headings, no markup. */
export function arrivalReplyText(a: Arrival, opts: { now?: number } = {}): string {
  const r = readArrival(a, opts);
  return [r.read, r.summary, `Next: ${r.nextStep} Nothing has been done with it yet.`].join("\n");
}
