// Compression — one signal, many bodies.
//
// The judgment layer decides IF something is said. This decides HOW MUCH is
// said on a given channel. The rule from the doctrine: the smaller or more
// interruptive the channel, the less Echo says. Facts are never invented and
// never rewritten — only dropped from the tail.
//
// Every caller that speaks to a channel goes through here, so wordings stop
// being re-typed per call site. Pure module: no IO, no Deno APIs.
import type { CommunicationChannel } from "./deliver.ts";

/** How much of a notice a surface can carry. */
export type Verbosity = "rich" | "brief" | "signal" | "spoken" | "cue";

/**
 * The facts a notice is built from. Nothing here is optional-by-accident:
 * a channel that can only carry one line carries `title`.
 */
export type NoticeFacts = {
  /** One-line headline. Always present. */
  title: string;
  /** Why the user is seeing this. */
  why?: string | null;
  /** Concrete detail lines (guest, dates, amount…). Order is meaningful. */
  lines?: string[];
  /** The exact closing line. Verbatim — callers own this sentence. */
  nextStepLine?: string | null;
  /** Appended as an "Open Metro Echo" line when present. */
  publicUrl?: string | null;
};

/** Which verbosity a channel gets. Desk is the only rich surface. */
export function verbosityForChannel(channel: CommunicationChannel): Verbosity {
  switch (channel) {
    case "today":
      return "rich";
    case "messaging":
    case "phone":
      return "brief";
    case "wearable":
      return "signal";
    case "voice":
      return "spoken";
    case "ambient":
      return "cue";
    default:
      return "cue";
  }
}

function body(facts: NoticeFacts): string[] {
  return [facts.why ?? "", ...(facts.lines ?? [])].map((l) => String(l ?? "").trim()).filter(Boolean);
}

function openLine(publicUrl?: string | null): string | null {
  const url = (publicUrl ?? "").replace(/\/$/, "");
  return url ? `Open Metro Echo: ${url}/` : null;
}

/**
 * Render a notice at a given verbosity.
 *
 *  rich   — headline, every fact, the next step, the link.
 *  brief  — headline, facts, next step, link. (Telegram / push today.)
 *  signal — headline plus at most one fact. Wearable.
 *  spoken — one sentence, offering the detail instead of dumping it.
 *  cue    — presence only. No detail until asked.
 */
export function compressNotice(facts: NoticeFacts, verbosity: Verbosity): string {
  const title = facts.title.trim();
  const detail = body(facts);
  const tail = (facts.nextStepLine ?? "").trim();

  switch (verbosity) {
    case "rich":
    case "brief": {
      const out = [title, ...detail];
      if (tail) out.push(tail);
      const link = openLine(facts.publicUrl);
      if (link) out.push(link);
      return out.join("\n");
    }
    case "signal":
      return [title, detail[0]].filter(Boolean).join("\n");
    case "spoken": {
      const first = detail[0];
      return first ? `${title}. ${first} Want the rest?` : `${title}. Want the detail?`;
    }
    case "cue":
    default:
      return "One thing changed.";
  }
}

/** Convenience: compress straight for a channel. */
export function compressForChannel(facts: NoticeFacts, channel: CommunicationChannel): string {
  return compressNotice(facts, verbosityForChannel(channel));
}
