// useSituation — the read behind Today's first block.
//
// It fetches authoritative state (never chat memory), hands it to the pure
// situation reader, and reports which sources had nothing to say versus which
// ones could not be read at all. It writes nothing and decides nothing.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { cadenceFromRow, type Cadence } from "@/lib/baseline";
import { readSituation, type SituationPlace, type SituationRead, type SituationSource } from "@/lib/situation";
import { classifyTier } from "@/lib/awarenessPlainTalk";
import { placeYouAreAt } from "@/lib/trips";
import { useAwareness, type AwarenessPlace } from "@/providers/AwarenessProvider";
import { recipeById } from "@/lib/crossref";
import { proposeReading, type PairProposal, type ReadableSource } from "@/lib/crossrefPairs";
import type { TodayDigest } from "@/hooks/useTodayDigest";
import { readMessageLane, surfacedArrivals, type Arrival } from "@/lib/messageLane";
import { readArrival } from "@/lib/arrivalRead";
import { displayPlatform } from "@/lib/plainEnglish";
import { distMeters } from "@/lib/locationSanity";
import { readCrossSituations, type CrossFact, type CrossSituation } from "@/lib/crossSource";

const HOURS_12 = 12 * 60 * 60 * 1000;

type ArrivedRow = { id: string; original_name: string | null; created_at: string; source: string | null };

export function useSituation(digest: TodayDigest): { read: SituationRead | null; loading: boolean } {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  /* Today used to fetch its own place and then never look again, so a fix in a
     new city moved the map and left this read talking about the last country.
     The provider already listens for place writes; Today rides that signal. */
  const { place: livePlace, snapshot } = useAwareness();
  const placeTick = `${livePlace?.id ?? ""}|${livePlace?.updated_at ?? ""}|${livePlace?.country ?? ""}`;
  const [read, setRead] = useState<SituationRead | null>(null);
  const [loading, setLoading] = useState(true);
  /* Only the newest read may speak. Two reads in flight used to land in
     whatever order the network felt like, so the same row alternated between
     two truthful-but-different sentences. A stale answer is discarded. */
  const runRef = useRef(0);
  /* The rows this read is built from, identified by content instead of by
     array identity — a refetch that returns the same promises must not count
     as a change. */
  const overdueKey = digest.overdue.map((c) => `${c.id}:${c.due_at ?? ""}`).join(",");
  const dueSoonKey = [...digest.dueToday, ...digest.upcoming].map((c) => `${c.id}:${c.due_at ?? ""}`).join(",");
  const actionsKey = digest.actions.map((a) => `${a.id}:${a.updated_at ?? ""}`).join(",");
  const noticedKey = digest.noticed?.id ?? "";

  const build = useCallback(async () => {
    if (!session?.user) return;
    const runId = ++runRef.current;
    const stale = () => runId !== runRef.current;
    setLoading(true);
    const unknownSources: SituationSource[] = [];

    /* Meetings — only the next few hours matter for a situational read. */
    let meetings: Array<{ id: string; title: string; starts_at: string; location: string | null; distanceM?: number | null }> = [];
    /* Ongoing — a hotel stay, a travel week, anything that started before today
       and has not ended. It never appears in a "starts from now" window, which
       is exactly why it used to vanish from the day. */
    let ongoing: Array<{
      id: string;
      title: string;
      starts_at: string;
      ends_at: string | null;
      all_day: boolean;
      location: string | null;
    }> = [];
    const nowIso = new Date().toISOString();
    const [cal, run] = await Promise.all([
      applyScope(supabase.from("calendar_events").select("id, title, starts_at, location"))
        .gte("starts_at", new Date(Date.now() - HOURS_12).toISOString())
        .lte("starts_at", new Date(Date.now() + HOURS_12).toISOString())
        .order("starts_at", { ascending: true })
        .limit(5),
      applyScope(supabase.from("calendar_events").select("id, title, starts_at, ends_at, all_day, location"))
        .lte("starts_at", nowIso)
        .gt("ends_at", nowIso)
        .order("ends_at", { ascending: true })
        .limit(5),
    ]);
    if (cal.error) unknownSources.push("calendar");
    else meetings = (cal.data ?? []).map((e) => ({
      id: e.id,
      title: e.title ?? "Untitled event",
      starts_at: e.starts_at,
      location: (e as any).location ?? null,
    }));
    if (!run.error) {
      ongoing = (run.data ?? []).map((e: any) => ({
        id: e.id,
        title: e.title ?? "Untitled event",
        starts_at: e.starts_at,
        ends_at: e.ends_at ?? null,
        all_day: Boolean(e.all_day),
        location: e.location ?? null,
      }));
    }


    /* Unfiled captures — what landed and is still waiting in Inbox. Two shapes
       land there: files and pages, and messages that arrived from a channel
       (Telegram, email) that Echo could not route on its own. Both are things
       waiting on a person, so both count here. */
    let arrived: Array<{
      id: string;
      label: string;
      at: string;
      via?: string | null;
      read?: string | null;
      why?: ReturnType<typeof readMessageLane>[number]["why"];
    }> = [];
    const [inbox, unrouted] = await Promise.all([
      applyScope(supabase.from("ingested_files").select("id, filename, created_at, source"))
        .in("review_status", ["new", "needs_review", "suggested"])
        .order("created_at", { ascending: false })
        .limit(12),
      applyScope(supabase.from("messages").select("id, content, created_at, metadata"))
        .eq("role", "user")
        .eq("metadata->>needs_review", "true")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    if (inbox.error) unknownSources.push("inbox");

    /* Everything that landed goes through one set of rules: the same copy twice
       is one arrival, something a week old is not news, and only a few things
       may ask for attention at once. What is held back keeps its reason. */
    const candidates: Arrival[] = [];
    for (const f of inbox.data ?? []) {
      candidates.push({
        id: f.id,
        text: f.filename || "A capture",
        at: f.created_at,
        channel: f.source === "telegram" ? "telegram" : "upload",
        where: f.source === "telegram" ? "Telegram" : null,
        unfiled: true,
        attachment: f.filename ?? null,
      });
    }
    for (const m of unrouted.data ?? []) {
      const meta = (m.metadata ?? {}) as Record<string, unknown>;
      const text = (m.content ?? "").replace(/\s+/g, " ").trim();
      const src = typeof meta.source === "string" ? meta.source : null;
      candidates.push({
        id: m.id,
        text: text || "A message",
        at: m.created_at,
        channel: src === "telegram" ? "telegram" : src === "email" ? "email" : "other",
        where: src === "telegram" ? "Telegram" : src,
        unfiled: true,
      });
    }
    const lane = readMessageLane(candidates);
    arrived = surfacedArrivals(lane).map((item) => {
      const text = item.arrival.text;
      const r = readArrival(item.arrival);
      return {
        id: item.arrival.id,
        label: text.length > 70 ? `${text.slice(0, 69)}…` : text,
        at: item.arrival.at,
        /* Same sentence the Aware room and Telegram use for this arrival. */
        read: `${r.read} ${r.summary}`.trim(),
        why: item.why,
        /* Say the source the way a person would, never its internal key. */
        via:
          item.arrival.channel === "upload"
            ? "a file you added"
            : item.arrival.where
              ? displayPlatform(item.arrival.where)
              : null,
      };
    });

    /* Projects plus the cadence Echo already learned for them. */
    let projects: Array<{ id: string; title: string; lastEventAt: string | null; cadence: Cadence | null }> = [];
    const [projRes, cadRes] = await Promise.all([
      applyScope(supabase.from("projects").select("id, title, updated_at")).limit(40),
      applyScope(
        supabase
          .from("object_cadence")
          .select("object_type, object_id, window_days, samples, median_gap_days, last_event_at"),
      )
        .eq("object_type", "project")
        .limit(200),
    ]);
    if (!projRes.error) {
      const byId = new Map<string, Cadence | null>();
      for (const row of cadRes.data ?? []) {
        byId.set(row.object_id, cadenceFromRow(row));
      }
      projects = (projRes.data ?? []).map((p) => ({
        id: p.id,
        title: p.title,
        lastEventAt: byId.get(p.id)?.lastAt ?? p.updated_at,
        cadence: byId.get(p.id) ?? null,
      }));
    }

    /* Cross-reference readings Sherlock left waiting for review. */
    let matters: Array<{
      id: string;
      title: string;
      sources: string[];
      templateLabel: string | null;
      conflicts?: number;
      at: string;
    }> = [];
    const caseRes = await applyScope(
      supabase.from("cross_ref_cases").select("id, title, recipe_id, updated_at, created_at"),
    )
      .in("status", ["matrix_ready", "reviewed"])
      .order("updated_at", { ascending: false })
      .limit(3);
    if (!caseRes.error && (caseRes.data ?? []).length > 0) {
      const ids = (caseRes.data ?? []).map((c) => c.id);
      const [srcRes, conflictRes] = await Promise.all([
        supabase.from("case_sources").select("case_id, filename").in("case_id", ids),
        supabase.from("case_conflicts").select("case_id").in("case_id", ids),
      ]);
      const labels = new Map<string, string[]>();
      for (const row of srcRes.data ?? []) {
        const list = labels.get(row.case_id) ?? [];
        if (row.filename) list.push(row.filename);
        labels.set(row.case_id, list);
      }
      const conflicts = new Map<string, number>();
      for (const row of conflictRes.data ?? []) {
        conflicts.set(row.case_id, (conflicts.get(row.case_id) ?? 0) + 1);
      }
      matters = (caseRes.data ?? []).map((c) => ({
        id: c.id,
        title: c.title || "A reading",
        sources: labels.get(c.id) ?? [],
        templateLabel: c.recipe_id ? (recipeById(c.recipe_id)?.label ?? null) : null,
        conflicts: conflicts.get(c.id) ?? 0,
        at: c.updated_at ?? c.created_at,
      }));
    }

    /* Sources already in hand that look like they belong together. Noticed by
       filename and arrival only — no model runs to make this suggestion. */
    let proposal: PairProposal | null = null;
    const readables = await applyScope(
      supabase
        .from("ingested_files")
        .select("id, filename, mime_type, source, created_at, extracted_text"),
    )
      .order("created_at", { ascending: false })
      .limit(24);
    if (!readables.error) {
      const pool: ReadableSource[] = (readables.data ?? []).map((f) => ({
        id: f.id,
        filename: f.filename ?? "",
        mime_type: f.mime_type,
        source: f.source,
        created_at: f.created_at,
        readable: Boolean(f.extracted_text && String(f.extracted_text).trim().length > 20),
      }));
      proposal = proposeReading(pool);
    }

    /* Cross-source: things Echo already has on file, read against what is on
       the board. Recorded rows only — nothing here calls a provider, so Today
       never spends a mail or Drive read just to load. */
    let crossSource: CrossSituation[] = [];
    {
      const anchors: CrossFact[] = [
        ...meetings.map((m) => ({
          id: m.id,
          kind: "calendar" as const,
          title: m.title,
          at: m.starts_at,
          location: m.location,
        })),
        ...ongoing.map((o) => ({
          id: o.id,
          kind: "calendar" as const,
          title: o.title,
          at: o.starts_at,
          location: o.location ?? null,
        })),
        ...[...digest.overdue, ...digest.dueToday, ...digest.upcoming].map((c) => ({
          id: c.id,
          kind: "commitment" as const,
          title: c.summary,
          at: c.due_at ?? null,
        })),
      ];
      const supporting: CrossFact[] = (readables.data ?? []).map((f) => ({
        id: f.id,
        kind: "file" as const,
        title: f.filename ?? "Untitled",
        at: f.created_at ?? null,
      }));
      if (anchors.length > 0 && supporting.length > 0) {
        crossSource = readCrossSituations({ anchors, supporting });
      }
    }


    /* Where the read is being made from. The active place is simply the most
       recently touched one — the same rule the Aware room uses, so both rooms
       are standing in the same spot. Place only changes wording. */
    let place: SituationPlace | null = null;
    let activeFix: { lat: number; lon: number } | null = null;
    const placeRes = await supabase
      .from("awareness_places")
      .select("id, label, geo, country, region, updated_at")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(12);
    const placeRows = (placeRes.data ?? []) as Array<AwarenessPlace & { updated_at: string }>;
    if (!placeRes.error && placeRows.length > 0) {
      const row = placeRows[0];
      const tier = classifyTier(row);
      const scope: SituationPlace["scope"] =
        tier.tier === "saved" ? "area" : (tier.tier as SituationPlace["scope"]);
      /* Standing inside a place you saved? Distance check against the other
         saved pins — never a guess, never a claim of proximity when it fails. */
      const geo = (row.geo ?? {}) as any;
      const fix =
        Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lon))
          ? { lat: Number(geo.lat), lon: Number(geo.lon) }
          : null;
      activeFix = fix;
      const savedPlace = placeYouAreAt(
        fix,
        placeRows.slice(1).map((p) => ({
          label: p.label,
          lat: (p.geo as any)?.lat ?? null,
          lon: (p.geo as any)?.lon ?? null,
        })),
      );
      place = {
        where: tier.city || tier.region || tier.country || row.label,
        scope,
        at: row.updated_at ?? null,
        savedPlace,
      };

      /* Distance to a meeting is measured, never estimated: it exists only when
         the meeting names a place you have saved with a fix of its own. No
         match, no coordinates — no distance in the sentence. */
      if (activeFix) {
        const saved = placeRows
          .map((p) => ({
            label: String(p.label ?? "").trim(),
            lat: Number((p.geo as any)?.lat),
            lon: Number((p.geo as any)?.lon),
          }))
          .filter((p) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lon));
        meetings = meetings.map((m) => {
          const where = String(m.location ?? "").trim().toLowerCase();
          if (!where) return m;
          const hit = saved.find(
            (p) => where.includes(p.label.toLowerCase()) || p.label.toLowerCase().includes(where),
          );
          return hit ? { ...m, distanceM: distMeters(activeFix!, { lat: hit.lat, lon: hit.lon }) } : m;
        });
      }
    }

    if (stale()) return;
    setRead(
      readSituation({
        overdue: digest.overdue.map((c) => ({ id: c.id, summary: c.summary, due_at: c.due_at })),
        dueSoon: [...digest.dueToday, ...digest.upcoming].map((c) => ({ id: c.id, summary: c.summary, due_at: c.due_at })),
        waitingOnYou: digest.actions.map((a) => ({ id: a.id, title: a.title, updated_at: a.updated_at })),
        arrived,
        noticed: digest.noticed
          ? [{
              id: digest.noticed.id,
              title: digest.noticed.title,
              reason: digest.noticed.body ?? "Echo flagged this from what it already had on record.",
              at: new Date().toISOString(),
              // A calendar heads-up says calendar. It never borrows the pattern
              // desk's name for work it did not do.
              source: /appointment|meeting/.test((digest.noticed as { kind?: string }).kind ?? "")
                ? ("calendar" as const)
                : undefined,
            }]
          : [],
        meetings,
        ongoing,

        projects,
        matters,
        proposal: proposal
          ? { filenames: proposal.filenames, reason: proposal.reason, signal: proposal.signal, at: proposal.at }
          : null,
        unknownSources,
        place,
        crossSource,
        /* Weather rides on the lines it affects instead of taking a card. */
        forecast: (snapshot?.compact?.weather?.hourly ?? []).map((h) => ({
          at: h.at,
          tempC: h.tempC,
          condition: h.condition,
          rainChance: h.rainChance,
        })),
      }),
    );
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, scopeKey, overdueKey, dueSoonKey, actionsKey, noticedKey, applyScope, placeTick, snapshot?.id]);

  useEffect(() => {
    if (digest.loadingCritical) return;
    void build();
  }, [build, digest.loadingCritical]);

  return { read, loading };
}
