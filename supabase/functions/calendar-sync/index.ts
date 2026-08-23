// calendar-sync — pull subscribed calendar feeds into Vanta.
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
import { normalizeCalendarUrl, parseIcs } from "../_shared/ics.ts";

const DAY_MS = 86_400_000;
const WINDOW_BACK_DAYS = 1;
const WINDOW_FORWARD_DAYS = 30;
const MAX_EVENTS_PER_FEED = 400;

type FeedRow = {
  id: string;
  user_id: string;
  organization_id: string | null;
  label: string;
  url: string;
  default_project_id: string | null;
};

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


async function syncFeed(sb: ReturnType<typeof createClient>, feed: FeedRow, now: number) {
  const url = normalizeCalendarUrl(feed.url);
  const stamp = new Date(now).toISOString();
  if (!url) {
    await sb.from("calendar_feeds").update({ last_error: "That link is not a secure calendar address.", last_synced_at: stamp }).eq("id", feed.id);
    return { feed: feed.id, ok: false, error: "bad_url" };
  }

  let text = "";
  try {
    const r = await fetch(url, { headers: { Accept: "text/calendar, text/plain" } });
    if (!r.ok) throw new Error(explainStatus(r.status, url));
    text = await r.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "the calendar did not answer";
    await sb.from("calendar_feeds").update({ last_error: msg.slice(0, 200), last_synced_at: stamp }).eq("id", feed.id);
    return { feed: feed.id, ok: false, error: msg };
  }

  if (!/BEGIN:VCALENDAR/i.test(text)) {
    await sb.from("calendar_feeds").update({ last_error: "That address did not return a calendar.", last_synced_at: stamp }).eq("id", feed.id);
    return { feed: feed.id, ok: false, error: "not_a_calendar" };
  }

  const fromMs = now - WINDOW_BACK_DAYS * DAY_MS;
  const toMs = now + WINDOW_FORWARD_DAYS * DAY_MS;
  const events = parseIcs(text, { fromMs, toMs }).slice(0, MAX_EVENTS_PER_FEED);

  // Project links are the user's own structural work, not the calendar's. The
  // feed is the source of truth for *what* is on the day, never for how the
  // user filed it — so remember the links before replacing the window.
  const { data: priorRows } = await sb
    .from("calendar_events")
    .select("uid, starts_at, project_id")
    .eq("feed_id", feed.id)
    .not("project_id", "is", null);
  const priorLinks = new Map<string, string>();
  for (const r of (priorRows ?? []) as { uid: string; starts_at: string; project_id: string | null }[]) {
    if (r.project_id) priorLinks.set(`${r.uid}|${r.starts_at}`, r.project_id);
  }

  // Replace the window: the feed is the source of truth, so removed entries
  // must disappear instead of lingering as ghosts.
  await sb.from("calendar_events").delete().eq("feed_id", feed.id).gte("starts_at", new Date(fromMs).toISOString());

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


  await sb.from("calendar_feeds")
    .update({ last_error: null, last_synced_at: stamp, event_count: events.length })
    .eq("id", feed.id);

  await sb.from("audit_log").insert({
    user_id: feed.user_id,
    organization_id: feed.organization_id,
    entity_type: "calendar_feed",
    entity_id: feed.id,
    event: "calendar.synced",
    payload: { label: feed.label, events: events.length, window_days: WINDOW_FORWARD_DAYS },
  });

  return { feed: feed.id, ok: true, events: events.length };
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
    let q = sb.from("calendar_feeds").select("id, user_id, organization_id, label, url, default_project_id").eq("user_id", userId).eq("active", true);
    if (body?.feed_id) q = q.eq("id", body.feed_id);
    const { data } = await q.limit(20);
    feeds = (data ?? []) as FeedRow[];
  } else {
    const { data } = await sb
      .from("calendar_feeds")
      .select("id, user_id, organization_id, label, url, default_project_id")
      .eq("active", true)
      .limit(200);
    feeds = (data ?? []) as FeedRow[];
  }

  const results = [];
  for (const f of feeds) results.push(await syncFeed(sb, f, now));

  return jsonResponse({ ok: true, synced: results.length, results });
});
