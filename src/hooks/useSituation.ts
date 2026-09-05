// useSituation — the read behind Today's first block.
//
// It fetches authoritative state (never chat memory), hands it to the pure
// situation reader, and reports which sources had nothing to say versus which
// ones could not be read at all. It writes nothing and decides nothing.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { cadenceFromRow, type Cadence } from "@/lib/baseline";
import { readSituation, type SituationPlace, type SituationRead, type SituationSource } from "@/lib/situation";
import { classifyTier } from "@/lib/awarenessPlainTalk";
import { placeYouAreAt } from "@/lib/trips";
import type { AwarenessPlace } from "@/providers/AwarenessProvider";
import { recipeById } from "@/lib/crossref";
import { proposeReading, type PairProposal, type ReadableSource } from "@/lib/crossrefPairs";
import type { TodayDigest } from "@/hooks/useTodayDigest";

const HOURS_12 = 12 * 60 * 60 * 1000;

type ArrivedRow = { id: string; original_name: string | null; created_at: string; source: string | null };

export function useSituation(digest: TodayDigest): { read: SituationRead | null; loading: boolean } {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [read, setRead] = useState<SituationRead | null>(null);
  const [loading, setLoading] = useState(true);

  const build = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    const unknownSources: SituationSource[] = [];

    /* Meetings — only the next few hours matter for a situational read. */
    let meetings: Array<{ id: string; title: string; starts_at: string; location: string | null }> = [];
    const cal = await applyScope(supabase.from("calendar_events").select("id, title, starts_at, location"))
      .gte("starts_at", new Date(Date.now() - HOURS_12).toISOString())
      .lte("starts_at", new Date(Date.now() + HOURS_12).toISOString())
      .order("starts_at", { ascending: true })
      .limit(5);
    if (cal.error) unknownSources.push("calendar");
    else meetings = (cal.data ?? []).map((e) => ({
      id: e.id,
      title: e.title ?? "Untitled event",
      starts_at: e.starts_at,
      location: (e as any).location ?? null,
    }));

    /* Unfiled captures — what landed and is still waiting in Inbox. Two shapes
       land there: files and pages, and messages that arrived from a channel
       (Telegram, email) that Vanta could not route on its own. Both are things
       waiting on a person, so both count here. */
    let arrived: Array<{ id: string; label: string; at: string; via?: string | null }> = [];
    const [inbox, unrouted] = await Promise.all([
      applyScope(supabase.from("ingested_files").select("id, filename, created_at, source"))
        .eq("review_status", "pending")
        .order("created_at", { ascending: false })
        .limit(5),
      applyScope(supabase.from("messages").select("id, content, created_at, metadata"))
        .eq("role", "user")
        .eq("metadata->>needs_review", "true")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (inbox.error) unknownSources.push("inbox");
    else arrived = (inbox.data ?? []).map((f) => ({
      id: f.id,
      label: f.filename || "A capture",
      at: f.created_at,
      via: f.source,
    }));
    if (!unrouted.error) {
      for (const m of unrouted.data ?? []) {
        const meta = (m.metadata ?? {}) as Record<string, unknown>;
        const text = (m.content ?? "").replace(/\s+/g, " ").trim();
        arrived.push({
          id: m.id,
          label: text.length > 70 ? `${text.slice(0, 69)}…` : text || "A message",
          at: m.created_at,
          via: typeof meta.source === "string" ? meta.source : null,
        });
      }
      arrived.sort((a, b) => b.at.localeCompare(a.at));
      arrived = arrived.slice(0, 5);
    }

    /* Projects plus the cadence Vanta already learned for them. */
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

    /* Where the read is being made from. The active place is simply the most
       recently touched one — the same rule the Aware room uses, so both rooms
       are standing in the same spot. Place only changes wording. */
    let place: SituationPlace | null = null;
    const placeRes = await supabase
      .from("awareness_places")
      .select("id, label, geo, country, region, updated_at")
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
    }

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
              reason: digest.noticed.body ?? "Vanta flagged this from what it already had on record.",
              at: new Date().toISOString(),
            }]
          : [],
        meetings,
        projects,
        matters,
        proposal: proposal
          ? { filenames: proposal.filenames, reason: proposal.reason, signal: proposal.signal, at: proposal.at }
          : null,
        unknownSources,
        place,
      }),
    );
    setLoading(false);
  }, [session?.user?.id, scopeKey, digest.overdue, digest.dueToday, digest.upcoming, digest.actions, digest.noticed, applyScope]);

  useEffect(() => {
    if (digest.loadingCritical) return;
    void build();
  }, [build, digest.loadingCritical]);

  return { read, loading };
}
