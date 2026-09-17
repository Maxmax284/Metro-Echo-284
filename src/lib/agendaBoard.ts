// agendaBoard — the arithmetic behind the agenda board.
//
// Doctrine:
//   - A board says four things about an entry: when, how long, where, and who.
//     Anything it cannot say honestly, it leaves blank rather than filling in.
//   - The same entry arriving from two calendars is one entry. The dedupe rule
//     here matches the server's (uid when there is one, otherwise title) so the
//     board and Echo's answers can never disagree about what is on a day.
//   - A stay is not an appointment. Something spanning days reads as a stay with
//     the days remaining, not as a block sitting on one morning.

export type BoardEntry = {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  attendees?: string[] | null;
  description?: string | null;
  uid?: string | null;
  origin?: "feed" | "echo";
  projectTitle?: string | null;
  feedLabel?: string;
};

/** One row per real entry. Same key the server uses. */
export function dedupeBoard<T extends BoardEntry>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const who = r.uid ? `uid:${r.uid}` : (r.title ?? "").trim().toLowerCase();
    const key = `${who}|${r.starts_at}|${r.ends_at ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export function durationMinutes(e: BoardEntry): number | null {
  if (!e.ends_at) return null;
  const mins = Math.round((new Date(e.ends_at).getTime() - new Date(e.starts_at).getTime()) / 60000);
  return mins > 0 ? mins : null;
}

/** "45 min", "1h 30m", "3 days". Blank when the entry never said how long. */
export function durationWords(e: BoardEntry): string {
  const mins = durationMinutes(e);
  if (mins == null) return "";
  if (mins >= 24 * 60) {
    const days = Math.round(mins / (24 * 60));
    return `${days} ${days === 1 ? "day" : "days"}`;
  }
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${String(m).padStart(2, "0")}m` : `${h}h`;
}

/** True when the entry spans more than one calendar day — a stay, not a slot. */
export function isStay(e: BoardEntry): boolean {
  const mins = durationMinutes(e);
  return mins != null && mins >= 20 * 60;
}

/** Nights left in a stay, counted from `now`. Null when it is not a stay. */
export function nightsLeft(e: BoardEntry, now = new Date()): number | null {
  if (!isStay(e) || !e.ends_at) return null;
  const end = new Date(e.ends_at).getTime();
  const left = Math.ceil((end - now.getTime()) / 86_400_000);
  return left > 0 ? left : 0;
}

/** The room, the address, the place — whatever the entry actually carried. */
export function roomLabel(e: BoardEntry): string {
  const loc = (e.location ?? "").trim();
  if (!loc) return "";
  /* A long address reads as a place, not a room. Keep the first meaningful part. */
  const first = loc.split(",")[0].trim();
  return first.length >= 3 ? first : loc;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/**
 * The people on an entry. Explicit attendees win; otherwise any address written
 * into the description counts, because that is where a forwarded invite puts them.
 * Never invents a name from a title.
 */
export function peopleOn(e: BoardEntry): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    const t = v.trim();
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
  };
  for (const a of e.attendees ?? []) if (a) push(String(a));
  if (out.length === 0) for (const m of (e.description ?? "").match(EMAIL) ?? []) push(m);
  return out;
}

/** "Dani" out of "dani@example.com"; a plain name is left alone. */
export function personLabel(raw: string): string {
  const t = raw.trim();
  if (!t.includes("@")) return t;
  const local = t.split("@")[0].replace(/[._-]+/g, " ").trim();
  return local
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function peopleWords(e: BoardEntry): string {
  const people = peopleOn(e).map(personLabel);
  if (people.length === 0) return "";
  if (people.length <= 2) return people.join(" and ");
  return `${people.slice(0, 2).join(", ")} +${people.length - 2}`;
}

/** One board line for a day, in the order a person reads it. */
export function boardFacts(e: BoardEntry): { duration: string; room: string; people: string } {
  return { duration: durationWords(e), room: roomLabel(e), people: peopleWords(e) };
}

/** How loaded a day is, for the calendar view. Counts stays once. */
export function dayLoad(entries: BoardEntry[]): number {
  return dedupeBoard(entries).length;
}

export type AgendaTimelineMarker = {
  id: string;
  title: string;
  startMinute: number;
  endMinute: number | null;
};

export type AgendaTimeline = {
  startMinute: number;
  endMinute: number;
  markers: AgendaTimelineMarker[];
  nowMinute: number | null;
  activeId: string | null;
  status: "now" | "next" | "clear" | "complete";
  statusTitle: string | null;
  clearMinutes: number | null;
};

function minuteInZone(iso: string, timezone: string): number | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function dateKeyInZone(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** A truthful strip for one selected day. All-day entries and stays get no fake position. */
export function buildAgendaTimeline(
  entries: BoardEntry[],
  selectedDayKey: string,
  timezone: string,
  now = new Date(),
): AgendaTimeline | null {
  const markers = entries
    .filter((entry) => !entry.all_day && !isStay(entry))
    .map((entry) => {
      const startMinute = minuteInZone(entry.starts_at, timezone);
      if (startMinute == null) return null;
      const rawEnd = entry.ends_at ? minuteInZone(entry.ends_at, timezone) : null;
      const endMinute = rawEnd != null && rawEnd > startMinute ? rawEnd : null;
      return {
        id: entry.id,
        title: entry.title?.trim() || "Untitled",
        startMinute,
        endMinute,
      };
    })
    .filter((marker): marker is AgendaTimelineMarker => marker !== null)
    .sort((a, b) => a.startMinute - b.startMinute);

  if (markers.length === 0) return null;

  const todayKey = dateKeyInZone(now, timezone);
  const isToday = selectedDayKey === todayKey;
  const nowMinute = isToday ? minuteInZone(now.toISOString(), timezone) : null;
  const earliest = markers[0].startMinute;
  const latest = Math.max(...markers.map((marker) => marker.endMinute ?? marker.startMinute + 30));
  const focusMinutes = nowMinute == null ? [earliest, latest] : [earliest, latest, nowMinute];
  let startMinute = Math.max(0, Math.floor((Math.min(...focusMinutes) - 60) / 60) * 60);
  let endMinute = Math.min(1440, Math.ceil((Math.max(...focusMinutes) + 60) / 60) * 60);
  if (endMinute - startMinute < 240) {
    const extra = 240 - (endMinute - startMinute);
    startMinute = Math.max(0, startMinute - Math.floor(extra / 2));
    endMinute = Math.min(1440, startMinute + 240);
    startMinute = Math.max(0, endMinute - 240);
  }

  const active = nowMinute == null
    ? null
    : markers.find((marker) => marker.endMinute != null && marker.startMinute <= nowMinute && marker.endMinute > nowMinute) ?? null;
  const next = nowMinute == null
    ? markers[0]
    : markers.find((marker) => marker.startMinute > nowMinute) ?? null;

  let status: AgendaTimeline["status"] = "next";
  let statusTitle: string | null = next?.title ?? null;
  let clearMinutes: number | null = null;
  if (active) {
    status = "now";
    statusTitle = active.title;
  } else if (isToday && next && nowMinute != null) {
    clearMinutes = Math.max(0, next.startMinute - nowMinute);
    status = clearMinutes >= 15 ? "clear" : "next";
  } else if (selectedDayKey < todayKey || (isToday && !next)) {
    status = "complete";
    statusTitle = null;
  }

  return {
    startMinute,
    endMinute,
    markers,
    nowMinute,
    activeId: active?.id ?? null,
    status,
    statusTitle,
    clearMinutes,
  };
}

/** The stay you are inside right now, if any. */
export function currentStay(entries: BoardEntry[], now = new Date()): BoardEntry | null {
  const t = now.getTime();
  const inside = dedupeBoard(entries).filter((e) => {
    if (!isStay(e) || !e.ends_at) return false;
    return new Date(e.starts_at).getTime() <= t && new Date(e.ends_at).getTime() > t;
  });
  inside.sort((a, b) => new Date(a.ends_at!).getTime() - new Date(b.ends_at!).getTime());
  return inside[0] ?? null;
}

/** The roof line: what you are in the middle of, and when it ends. */
export function stayLine(e: BoardEntry | null, now = new Date()): string {
  if (!e) return "";
  const left = nightsLeft(e, now);
  const title = (e.title ?? "A stay").trim();
  const room = roomLabel(e);
  const where = room ? ` in ${room}` : "";
  const end = e.ends_at
    ? new Date(e.ends_at).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })
    : "";
  if (left === 0) return `${title}${where} ends today.`;
  const nights = left === 1 ? "1 night left" : `${left} nights left`;
  return end ? `${title}${where} — ${nights}, until ${end}.` : `${title}${where} — ${nights}.`;
}
