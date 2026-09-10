// calendar-sync — pull subscribed calendar feeds into Metro Echo.
//
// Read-only sense. It fetches a public/secret .ics URL, keeps a short window of
// events (yesterday → 30 days out), and stops. It never writes commitments,
// never proposes actions, never notifies. Judgment happens later, centrally.
//
// Two modes:
//   - authenticated: { feed_id? } — sync the caller's feeds now.
//   - cron (service role, x-vanta-cron header or no session): sync every active feed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders, jsonResponse, preflight, readJson } from "../_shared/http.ts";
import { normalizeCalendarUrl, parseIcs, type IcsEvent } from "../_shared/ics.ts";
import { googleCalendarConnection } from "../_shared/calendarConnection.ts";
import { fetchGoogleEvents } from "./google.ts";

const DAY_MS = 86_400_000;
const WINDOW_BACK_DAYS = 1;
const WINDOW_FORWARD_DAYS = 30;
const MAX_EVENTS_PER_FEED = 400;

type FeedRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  label: string;
  url: string | null;
  provider?: string | null;
  default_project_id: string | null;
};

const FEED_COLUMNS = "id, user_id, organization_id, label, url, provider, default_project_id";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

/** Turn an HTTP status into something a person can act on. */
function explainStatus(status: number, url: string): string {
  const isGooglePublic = /calendar\.google\.com\/calendar\/ical\/.*\/public\/basic\.ics/i.test(url);
  if ((status === 404 || status === 403) && isGooglePublic) {
    return "That is the public address, and this calendar is not public. In Google Calendar use Secret address in iCal format instead.";
  }
  if (status === 404) return "That address does not exist any more. Copy the calendar's private iCal link again.";
  if (status === 401 || status === 403) return "The calendar refused the link. It may have been reset — copy a fresh private iCal link.";
  return `The calendar answered ${status}.`;
}

/** A row as it stood before this pass — the before-picture for the diff. */
type PriorRow = { uid: string; starts_at: string; title: string | null; project_id: string | null };

type ParsedEvent = { uid: string; title: string | null; startsAt: string };

export type CalendarChange = {
  uid: string;
  title: string | null;
  change: "added" | "moved" | "cancelled";
  oldStartsAt: string | null;
  newStartsAt: string | null;
  /** The entry was filed under a project, so the user planned around it. */
  wasFiled: boolean;
};

/** An addition is only news while it is close enough to affect the week. */
const ADDED_HORIZON_DAYS = 7;

/**
 * What actually changed between two pictures of the same window.
 *
 * Recurring entries share one uid, so the comparison works on the set of start
 * times per uid: a start that disappeared alongside one that appeared is the
 * same entry moving, not a cancellation plus an addition.
 *
 * A first sync (nothing held before) is a baseline, never a wall of "added".
 */
export function diffWindow(prior: PriorRow[], events: ParsedEvent[], now: number): CalendarChange[] {
  if (prior.length === 0) return [];

  const before = new Map<string, PriorRow[]>();
  for (const r of prior) {
    const list = before.get(r.uid) ?? [];
    list.push(r);
    before.set(r.uid, list);
  }
  const after = new Map<string, ParsedEvent[]>();
  for (const e of events) {
    const list = after.get(e.uid) ?? [];
    list.push(e);
    after.set(e.uid, list);
  }

  const out: CalendarChange[] = [];
  const addedCutoff = now + ADDED_HORIZON_DAYS * DAY_MS;

  for (const uid of new Set([...before.keys(), ...after.keys()])) {
    const wasList = before.get(uid) ?? [];
    const isList = after.get(uid) ?? [];
    const isStarts = new Set(isList.map((e) => e.startsAt));
    const wasStarts = new Set(wasList.map((r) => r.starts_at));

    const gone = wasList.filter((r) => !isStarts.has(r.starts_at)).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const fresh = isList.filter((e) => !wasStarts.has(e.startsAt)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const wasFiled = wasList.some((r) => !!r.project_id);
    const title = isList[0]?.title ?? wasList[0]?.title ?? null;

    const paired = Math.min(gone.length, fresh.length);
    for (let i = 0; i < paired; i++) {
      out.push({ uid, title, change: "moved", oldStartsAt: gone[i].starts_at, newStartsAt: fresh[i].startsAt, wasFiled });
    }
    for (const r of gone.slice(paired)) {
      out.push({ uid, title: r.title ?? title, change: "cancelled", oldStartsAt: r.starts_at, newStartsAt: null, wasFiled });
    }
    for (const e of fresh.slice(paired)) {
      const startMs = new Date(e.startsAt).getTime();
      if (!Number.isFinite(startMs) || startMs > addedCutoff) continue;
      out.push({ uid, title: e.title ?? title, change: "added", oldStartsAt: null, newStartsAt: e.startsAt, wasFiled });
    }
  }

  return out;
}



async function syncFeed(sb: ReturnType<typeof createClient>, feed: FeedRow, now: number) {
  const stamp = new Date(now).toISOString();
  const fromMs = now - WINDOW_BACK_DAYS * DAY_MS;
  const toMs = now + WINDOW_FORWARD_DAYS * DAY_MS;
  const provider = feed.provider === "google" ? "google" : "ical";

  const fail = async (message: string, code: string) => {
    await sb.from("calendar_feeds").update({ last_error: message.slice(0, 200), last_synced_at: stamp }).eq("id", feed.id);
    return { feed: feed.id, ok: false, error: code };
  };

  let events: IcsEvent[] = [];

  if (provider === "google") {
    // A signed-in Google account, read through the connector on this person's
    // behalf. No connection means no guessing: say so on the feed and stop.
    const conn = await googleCalendarConnection(feed.user_id);
    if (!conn) {
      return await fail("Google is not connected for this account. Sign in again in Settings.", "not_connected");
    }
    try {
      events = await fetchGoogleEvents(conn, "primary", fromMs, toMs, MAX_EVENTS_PER_FEED);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google did not answer";
      return await fail(msg, "google_unreachable");
    }
  } else {
    const url = normalizeCalendarUrl(feed.url ?? "");
    if (!url) return await fail("That link is not a secure calendar address.", "bad_url");

    let text = "";
    try {
      const r = await fetch(url, { headers: { Accept: "text/calendar, text/plain" } });
      if (!r.ok) throw new Error(explainStatus(r.status, url));
      text = await r.text();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "the calendar did not answer";
      return await fail(msg, msg);
    }

    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return await fail("That address did not return a calendar.", "not_a_calendar");
    }
    events = parseIcs(text, { fromMs, toMs }).slice(0, MAX_EVENTS_PER_FEED);
  }


  // Project links are the user's own structural work, not the calendar's. The
  // feed is the source of truth for *what* is on the day, never for how the
  // user filed it — so remember the links before replacing the window.
  // The same read is the before-picture used to work out what actually changed:
  // "synced" is not news, "your Tuesday meeting moved" is.
  // The window is anything touching it, not only what begins inside it — a stay
  // that started last week is still the truest thing about today.
  const fromIso = new Date(fromMs).toISOString();
  const inWindow = `starts_at.gte.${fromIso},ends_at.gt.${fromIso}`;
  const { data: priorRows } = await sb
    .from("calendar_events")
    .select("uid, starts_at, title, project_id")
    .eq("feed_id", feed.id)
    .or(inWindow);
  const prior = (priorRows ?? []) as PriorRow[];
  const priorLinks = new Map<string, string>();
  for (const r of prior) {
    if (r.project_id) priorLinks.set(`${r.uid}|${r.starts_at}`, r.project_id);
  }

  // Replace the window: the feed is the source of truth, so removed entries
  // must disappear instead of lingering as ghosts.
  await sb.from("calendar_events").delete().eq("feed_id", feed.id).or(inWindow);

  if (events.length) {
    const rows = events.map((e) => ({
      user_id: feed.user_id,
      organization_id: feed.organization_id,
      feed_id: feed.id,
      uid: e.uid,
      title: e.title,
      location: e.location,
      starts_at: e.startsAt,
      ends_at: e.endsAt,
      all_day: e.allDay,
      project_id: priorLinks.get(`${e.uid}|${e.startsAt}`) ?? feed.default_project_id ?? null,
    }));
    const { error } = await sb.from("calendar_events").upsert(rows, { onConflict: "feed_id,uid,starts_at", ignoreDuplicates: false });
    if (error) {
      await sb.from("calendar_feeds").update({ last_error: error.message.slice(0, 200), last_synced_at: stamp }).eq("id", feed.id);
      return { feed: feed.id, ok: false, error: error.message };
    }
  }

  const changes = diffWindow(prior, events, now);
  if (changes.length) {
    await sb.from("calendar_changes").insert(
      changes.map((c) => ({
        user_id: feed.user_id,
        organization_id: feed.organization_id,
        feed_id: feed.id,
        event_uid: c.uid,
        title: c.title,
        change: c.change,
        old_starts_at: c.oldStartsAt,
        new_starts_at: c.newStartsAt,
        was_filed: c.wasFiled,
      })),
    );
  }

  const tally = {
    added: changes.filter((c) => c.change === "added").length,
    moved: changes.filter((c) => c.change === "moved").length,
    cancelled: changes.filter((c) => c.change === "cancelled").length,
  };

  await sb.from("calendar_feeds")
    .update({
      last_error: null,
      last_synced_at: stamp,
      event_count: events.length,
      last_added: tally.added,
      last_moved: tally.moved,
      last_cancelled: tally.cancelled,
    })
    .eq("id", feed.id);

  await sb.from("audit_log").insert({
    user_id: feed.user_id,
    organization_id: feed.organization_id,
    entity_type: "calendar_feed",
    entity_id: feed.id,
    event: "calendar.synced",
    payload: { label: feed.label, events: events.length, window_days: WINDOW_FORWARD_DAYS, ...tally },
  });

  return { feed: feed.id, ok: true, label: feed.label, events: events.length, ...tally };
}


Deno.serve(async (req: Request) => {
  const pre = preflight(req);
  if (pre) return pre;

  if (!SUPABASE_URL || !SERVICE_KEY) return jsonResponse({ error: "not configured" }, 500, corsHeaders);
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const body = (await readJson(req)) as { feed_id?: string } | null;
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const now = Date.now();

  let feeds: FeedRow[] = [];
  if (token) {
    const { data: userData } = await sb.auth.getUser(token);
    const userId = userData?.user?.id;
    if (!userId) return jsonResponse({ error: "sign in required" }, 401);
    let q = sb.from("calendar_feeds").select(FEED_COLUMNS).eq("user_id", userId).eq("active", true);
    if (body?.feed_id) q = q.eq("id", body.feed_id);
    const { data } = await q.limit(20);
    feeds = (data ?? []) as FeedRow[];
  } else {
    const { data } = await sb
      .from("calendar_feeds")
      .select(FEED_COLUMNS)
      .eq("active", true)
      .limit(200);
    feeds = (data ?? []) as FeedRow[];
  }

  const results = [];
  for (const f of feeds) results.push(await syncFeed(sb, f, now));

  return jsonResponse({ ok: true, synced: results.length, results });
});
