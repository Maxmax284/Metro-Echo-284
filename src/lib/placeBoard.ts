// placeBoard — what the Today place strip says when you open it.
//
// Doctrine:
//   - recorded facts only. Named places come from the last scan or the nearby
//     lookup, changes come from two reads on file, the day comes from a calendar
//     you connected. Nothing here estimates travel time or invents a venue.
//   - at most three lines per group, three groups. The strip is an executive
//     cut; the Aware desk under Work holds the full detail.
//   - when there is nothing on file, the board says how something gets there
//     and offers the one explicit tap that reads this spot. It never scans
//     on its own.
//
// Pure module: no IO, no React. The caller hands over already-read state.
import { formatDistance } from "@/lib/trips";

export type BoardGroupKey = "around" | "changed" | "day";

export type BoardLine = {
  key: string;
  text: string;
  detail?: string | null;
};

export type BoardGroup = {
  key: BoardGroupKey;
  label: string;
  lines: BoardLine[];
};

export type PlaceBoard = {
  groups: BoardGroup[];
  /** Total lines across groups. Zero means the board has nothing to say. */
  count: number;
  /** "scanned 3h ago" / "never scanned here" — always in words. */
  scanLine: string;
  /** True when a read of this spot would actually add something. */
  needsScan: boolean;
  /** Shown when count is 0. Teaches, never just reports emptiness. */
  quiet: string;
};

export type PlaceBoardInput = {
  now?: number;
  /** Named places around the fix: scanned venues and the nearby lookup. */
  nearby?: Array<{ name: string; detail?: string | null; distanceM?: number | null }>;
  /** Local changes already worded by the Aware read. */
  changes?: Array<{ key: string; text: string; detail?: string | null }>;
  /** Calendar entries in the day ahead, soonest first. */
  events?: Array<{
    id: string;
    title: string | null;
    starts_at: string;
    all_day?: boolean;
    location?: string | null;
  }>;
  /** When this spot was last scanned, if ever. */
  scanAt?: string | null;
};

function ago(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "at an unknown time";
  const mins = (now - t) / 60000;
  if (mins < 2) return "just now";
  if (mins < 60) return `${Math.round(mins)}m ago`;
  const hours = mins / 60;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "2:15 pm", or "all day". Local clock, because this is the reader's day. */
export function eventTimeLabel(event: { starts_at: string; all_day?: boolean }): string {
  if (event.all_day) return "all day";
  const d = new Date(event.starts_at);
  if (Number.isNaN(d.getTime())) return "time unknown";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

const DAY_MS = 86_400_000;

export function readPlaceBoard(input: PlaceBoardInput): PlaceBoard {
  const now = input.now ?? Date.now();

  /* Around you — named ground first, closest first when a distance is on file. */
  const seen = new Set<string>();
  const around: BoardLine[] = [];
  const nearby = (input.nearby ?? []).filter((n) => (n.name ?? "").trim());
  const measured = nearby.filter((n) => Number.isFinite(Number(n.distanceM)));
  const unmeasured = nearby.filter((n) => !Number.isFinite(Number(n.distanceM)));
  measured.sort((a, b) => Number(a.distanceM) - Number(b.distanceM));
  for (const n of [...measured, ...unmeasured]) {
    const name = n.name.trim();
    const dedupe = name.toLowerCase();
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const dist = Number.isFinite(Number(n.distanceM)) ? formatDistance(Number(n.distanceM)) : null;
    around.push({
      key: `near:${dedupe}`,
      text: dist ? `${name} — ${dist} away` : name,
      detail: n.detail?.trim() || null,
    });
    if (around.length === 3) break;
  }

  /* Changed — what moved locally, already worded once by the Aware read. */
  const changed: BoardLine[] = (input.changes ?? [])
    .filter((c) => (c.text ?? "").trim())
    .slice(0, 3)
    .map((c) => ({ key: `chg:${c.key}`, text: c.text.trim(), detail: c.detail ?? null }));

  /* The day — calendar entries between now and this time tomorrow. */
  const day: BoardLine[] = (input.events ?? [])
    .filter((e) => {
      const t = new Date(e.starts_at).getTime();
      return Number.isFinite(t) && t <= now + DAY_MS;
    })
    .slice(0, 3)
    .map((e) => {
      const title = (e.title ?? "").trim() || "Untitled entry";
      const where = (e.location ?? "").trim();
      return {
        key: `evt:${e.id}`,
        text: `${eventTimeLabel(e)} — ${title}`,
        detail: where ? `At ${where}. Read from a calendar you connected.` : "Read from a calendar you connected.",
      };
    });

  const groups: BoardGroup[] = (
    [
      { key: "around", label: "Around you", lines: around },
      { key: "changed", label: "Local changes", lines: changed },
      { key: "day", label: "Your day here", lines: day },
    ] as BoardGroup[]
  ).filter((g) => g.lines.length > 0);

  const count = groups.reduce((n, g) => n + g.lines.length, 0);
  const scanLine = input.scanAt ? `Scanned ${ago(input.scanAt, now)}` : "Never scanned here";
  const scanAge = input.scanAt ? now - new Date(input.scanAt).getTime() : null;
  const needsScan = around.length === 0 || scanAge === null || scanAge > 7 * DAY_MS;

  return {
    groups,
    count,
    scanLine,
    needsScan,
    quiet: input.scanAt
      ? "The last read of this spot turned up nothing named. Read it again and places, changes and your day here land in this strip."
      : "Nothing has been read around here yet. Read this spot once and named places nearby land here with your day.",
  };
}
