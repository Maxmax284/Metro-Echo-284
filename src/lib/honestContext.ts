// honestContext — every time and place claim says where it came from.
//
// Doctrine: Echo may be approximate, but it may never be vague about how it
// knows. A browser clock is a device guess, not the truth. A geohash is an
// area, not an address. These helpers turn a source plus an optional confidence
// into one plain line, and they refuse to dress up a guess as a fact.
//
// Pure functions only — no clock, no navigator, no queries.

export type TimeSource = "profile" | "calendar" | "event" | "device" | "unknown";
export type PlaceSource = "saved" | "calendar" | "coarse" | "device" | "unknown";
export type Confidence = "high" | "medium" | "low" | null;

/** Short, human timezone name: "Asia/Bangkok" -> "Bangkok". */
export function timezoneName(tz: string | null | undefined): string {
  if (!tz) return "Unknown timezone";
  const tail = tz.split("/").pop() ?? tz;
  return tail.replace(/_/g, " ");
}

/**
 * One line under a time. Never claims a confirmed zone from a device guess.
 */
export function timeSourceLine(opts: {
  timezone: string | null | undefined;
  source: TimeSource;
  confidence?: Confidence;
}): string {
  const zone = timezoneName(opts.timezone);
  switch (opts.source) {
    case "profile":
      return `${zone} time · the timezone you set`;
    case "calendar":
      return `${zone} time · from calendar`;
    case "event":
      return `${zone} time · timezone confirmed from event source`;
    case "device":
      return `Local time · device source${opts.confidence === "low" ? " · not confirmed" : ""}`;
    case "unknown":
    default:
      return "Time shown without a confirmed source";
  }
}

/**
 * One line under a place. Coarse stays coarse — the word "approximate" is not
 * optional when the signal is an area.
 */
export function placeSourceLine(opts: {
  label?: string | null;
  source: PlaceSource;
  confidence?: Confidence;
}): string {
  const where = (opts.label ?? "").trim();
  switch (opts.source) {
    case "saved":
      return where ? `${where} · a place you saved` : "A place you saved";
    case "calendar":
      return where ? `${where} · from calendar` : "From calendar";
    case "coarse":
      return where ? `Approximate area · ${where} · coarse location` : "Approximate area · coarse location";
    case "device":
      return where ? `${where} · device source` : "Device source";
    case "unknown":
    default:
      return "No place signal · Echo is not guessing one";
  }
}

/** True when the value is an inference rather than a confirmed reading. */
export function isInferred(source: TimeSource | PlaceSource, confidence?: Confidence): boolean {
  if (source === "device" || source === "coarse" || source === "unknown") return true;
  return confidence === "low";
}

/** The suffix Echo appends when it is reading, not knowing. */
export function inferenceNote(source: TimeSource | PlaceSource, confidence?: Confidence): string | null {
  return isInferred(source, confidence) ? "Inferred — tell Echo if it is wrong." : null;
}
