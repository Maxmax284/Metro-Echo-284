// journeyNotice — turning "something on the journey moved" into one heads-up
// with the right amount of urgency behind it.
//
// Doctrine:
//   - No news is not a notice. An empty diff returns null and Echo says nothing.
//   - Urgency comes off the change itself, not off a feeling. A cancelled leg
//     and a gate that moved are not the same event and are not treated the same.
//   - Today always gets the note. Messaging only gets pinged when the change is
//     the kind you would want to be interrupted for.
//   - Every line still ends on the terminal caveat: the board there wins.
//
// The vocabulary this reads is closed: `packDiff` writes these lines, so the
// classifier is matching Echo's own phrasing, not scraped provider text.
//
// Pure module: no IO, no React.

export type NoticeUrgency = "low" | "normal" | "high" | "critical";

export type JourneyNotice = {
  kind: "journey_moved";
  title: string;
  body: string;
  /** 0–100, straight into the nudge row so Today ranks it honestly. */
  priority: number;
  urgency: NoticeUrgency;
  /** Whether this is worth a Telegram ping, consent and quiet hours aside. */
  reachMessaging: boolean;
};

const PRIORITY: Record<NoticeUrgency, number> = {
  critical: 90,
  high: 70,
  normal: 45,
  low: 20,
};

/** A delay of this many minutes or more stops being a footnote. */
export const BIG_DELAY_MIN = 30;

/** How many minutes a single diff line says the flight moved, if it says so. */
export function movedMinutes(line: string): number | null {
  const m = /(\d+)\s*min\s*(later|earlier)/i.exec(line);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  if (!Number.isFinite(mins)) return null;
  return m[2].toLowerCase() === "earlier" ? -mins : mins;
}

/** The worst thing in the batch decides how loud the heads-up is. */
export function classifyJourneyNews(lines: string[]): NoticeUrgency {
  let worst: NoticeUrgency = "low";
  const raise = (u: NoticeUrgency) => {
    if (PRIORITY[u] > PRIORITY[worst]) worst = u;
  };
  for (const raw of lines) {
    const line = raw.toLowerCase();
    if (/cancelled|diverted|recorded as not flown/.test(line)) raise("critical");
    else if (/\bgate\b|\bterminal\b/.test(line)) raise("high");
    else if (/in the air|on the ground|at the airport/.test(line)) raise("normal");
    const moved = movedMinutes(line);
    if (moved != null) raise(Math.abs(moved) >= BIG_DELAY_MIN ? "high" : "low");
  }
  return worst;
}

function titleFor(lines: string[], urgency: NoticeUrgency): string {
  const all = lines.join(" ").toLowerCase();
  if (/cancelled/.test(all)) return "Your flight is off";
  if (/diverted/.test(all)) return "Your flight was diverted";
  if (/\bgate\b/.test(all)) return "Your gate moved";
  if (/\bterminal\b/.test(all)) return "Your terminal moved";
  if (urgency === "high") return "Your flight time moved";
  return "Your journey moved";
}

/**
 * One heads-up, or nothing.
 *
 * `landed` is the arrival message — the moment you are on the ground with
 * another leg to go, which is always worth reaching you over. Otherwise the
 * diff lines carry the news, prefixed with where you are.
 */
export function journeyNotice(input: {
  news: string[];
  whereWords: string;
  landed: string | null;
  caveat: string;
}): JourneyNotice | null {
  const { news, whereWords, landed, caveat } = input;
  if (landed) {
    return {
      kind: "journey_moved",
      title: "You are on the ground",
      body: landed,
      priority: PRIORITY.high,
      urgency: "high",
      reachMessaging: true,
    };
  }
  const lines = news.filter((l) => l && l.trim().length > 0);
  if (lines.length === 0) return null;

  const urgency = classifyJourneyNews(lines);
  return {
    kind: "journey_moved",
    title: titleFor(lines, urgency),
    body: `${whereWords} ${lines.join(" ")} ${caveat}`.replace(/\s+/g, " ").trim(),
    priority: PRIORITY[urgency],
    urgency,
    reachMessaging: urgency === "high" || urgency === "critical",
  };
}

/** Quiet hours hold everything except the change you cannot sleep through. */
export function mayPingDuringQuietHours(urgency: NoticeUrgency): boolean {
  return urgency === "critical";
}

export const NOTICE_LAW =
  "Echo speaks up when a flight actually changes, and stays quiet when it does not. It never checks you in, rebooks, or buys.";
