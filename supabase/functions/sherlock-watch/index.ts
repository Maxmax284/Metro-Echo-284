// sherlock-watch — Phase 3b "watch" mode.
// Hourly scan over the entity graph that drafts Sherlock-style findings as
// nudges. Never sends push, never executes, never invents — only highlights
// patterns already visible in the user's own data:
//   1. HEAT    — entity referenced in 3+ distinct sources within 7 days
//   2. PAIRING — two entities co-occur on 2+ sources within 7 days
//   3. QUIET   — open commitment references an entity that's gone silent 10+ days
//
// Findings land in `nudges` with kind=sherlock_watch_*, deduped per scope so
// re-runs don't spam the Attention Queue. Surfaces through the existing
// NudgesPanel. No new tables, no new push channels, no auto-execution.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HEAT_MIN_SOURCES = 3;
const PAIRING_MIN_SOURCES = 2;
const QUIET_DAYS = 10;
const WINDOW_DAYS = 7;

type EntityLite = { id: string; display_name: string; kind: string };

async function watchForUser(sb: SupabaseClient, userId: string): Promise<number> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
  let drafted = 0;

  // ---- HEAT + PAIRING share the same recent link sample
  const { data: links } = await sb
    .from("entity_links")
    .select("entity_id, source_kind, source_id, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .limit(2000);

  const rows = (links ?? []) as Array<{ entity_id: string; source_kind: string; source_id: string }>;

  // entity -> set of "kind:id"
  const sources = new Map<string, Set<string>>();
  // source -> set of entities (for pairing)
  const perSource = new Map<string, Set<string>>();
  for (const r of rows) {
    const src = `${r.source_kind}:${r.source_id}`;
    if (!sources.has(r.entity_id)) sources.set(r.entity_id, new Set());
    sources.get(r.entity_id)!.add(src);
    if (!perSource.has(src)) perSource.set(src, new Set());
    perSource.get(src)!.add(r.entity_id);
  }

  const heatIds = [...sources.entries()].filter(([_, s]) => s.size >= HEAT_MIN_SOURCES).map(([id]) => id);

  // pairing counts
  const pairCounts = new Map<string, { a: string; b: string; sources: Set<string> }>();
  for (const [src, ents] of perSource) {
    const arr = [...ents];
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
      const a = arr[i] < arr[j] ? arr[i] : arr[j];
      const b = arr[i] < arr[j] ? arr[j] : arr[i];
      const k = `${a}::${b}`;
      if (!pairCounts.has(k)) pairCounts.set(k, { a, b, sources: new Set() });
      pairCounts.get(k)!.sources.add(src);
    }
  }
  const pairs = [...pairCounts.values()].filter((p) => p.sources.size >= PAIRING_MIN_SOURCES);

  // Resolve entity display info
  const needed = new Set<string>([...heatIds, ...pairs.flatMap((p) => [p.a, p.b])]);
  let entMap = new Map<string, EntityLite>();
  if (needed.size > 0) {
    const { data: ents } = await sb
      .from("entities")
      .select("id, display_name, kind")
      .in("id", [...needed]);
    for (const e of (ents ?? []) as EntityLite[]) entMap.set(e.id, e);
  }

  const stampHeat = async (id: string) => {
    const ent = entMap.get(id);
    if (!ent) return;
    const count = sources.get(id)?.size ?? 0;
    const dedupe = `sherlock.watch.heat:${id}:${new Date().toISOString().slice(0, 10)}`;
    const { error } = await sb.from("nudges").upsert({
      user_id: userId,
      kind: "sherlock_watch_heat",
      title: `${ent.display_name} keeps coming up`,
      body: `Mentioned across ${count} sources in the last ${WINDOW_DAYS} days. Might be worth a closer look.`,
      priority: 60,
      related_entity_type: "entity",
      related_entity_id: id,
      dedupe_key: dedupe,
      status: "pending",
      expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
    }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (!error) drafted++;
  };
  for (const id of heatIds) await stampHeat(id);

  const stampPair = async (p: { a: string; b: string; sources: Set<string> }) => {
    const ea = entMap.get(p.a); const eb = entMap.get(p.b);
    if (!ea || !eb) return;
    const dedupe = `sherlock.watch.pair:${p.a}:${p.b}:${new Date().toISOString().slice(0, 10)}`;
    const { error } = await sb.from("nudges").upsert({
      user_id: userId,
      kind: "sherlock_watch_pairing",
      title: `${ea.display_name} + ${eb.display_name} keep showing up together`,
      body: `Co-occurred across ${p.sources.size} sources in the last ${WINDOW_DAYS} days.`,
      priority: 50,
      related_entity_type: "entity",
      related_entity_id: p.a,
      dedupe_key: dedupe,
      status: "pending",
      expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
    }, { onConflict: "dedupe_key", ignoreDuplicates: true });
    if (!error) drafted++;
  };
  for (const p of pairs.slice(0, 10)) await stampPair(p);

  // ---- QUIET — open commitments referencing entities with no recent links
  const { data: commits } = await sb
    .from("commitments")
    .select("id, summary")
    .eq("user_id", userId)
    .eq("status", "open")
    .limit(200);

  const commitIds = ((commits ?? []) as any[]).map((c) => c.id);
  if (commitIds.length > 0) {
    const { data: commitLinks } = await sb
      .from("entity_links")
      .select("source_id, entity_id")
      .eq("user_id", userId)
      .eq("source_kind", "commitment")
      .in("source_id", commitIds);

    const cutoff = new Date(Date.now() - QUIET_DAYS * 86400_000).toISOString();
    for (const cl of (commitLinks ?? []) as any[]) {
      const { data: recent } = await sb
        .from("entity_links")
        .select("id")
        .eq("user_id", userId)
        .eq("entity_id", cl.entity_id)
        .gte("created_at", cutoff)
        .limit(1);
      if ((recent ?? []).length > 0) continue;

      const { data: ent } = await sb.from("entities").select("display_name").eq("id", cl.entity_id).maybeSingle();
      const commit = (commits as any[]).find((c) => c.id === cl.source_id);
      if (!ent || !commit) continue;

      const dedupe = `sherlock.watch.quiet:${cl.source_id}:${cl.entity_id}:${new Date().toISOString().slice(0, 10)}`;
      const { error } = await sb.from("nudges").upsert({
        user_id: userId,
        kind: "sherlock_watch_quiet",
        title: `Quiet on ${ent.display_name}`,
        body: `"${commit.summary.slice(0, 80)}" — no fresh mentions in ${QUIET_DAYS}+ days.`,
        priority: 55,
        related_entity_type: "commitment",
        related_entity_id: cl.source_id,
        dedupe_key: dedupe,
        status: "pending",
        expires_at: new Date(Date.now() + 3 * 86400_000).toISOString(),
      }, { onConflict: "dedupe_key", ignoreDuplicates: true });
      if (!error) drafted++;
    }
  }

  if (drafted > 0) {
    await sb.from("audit_log").insert({
      user_id: userId,
      entity_type: "sherlock_watch",
      event: "sherlock.watch.ran",
      payload: { drafted, window_days: WINDOW_DAYS },
    });
  }
  return drafted;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Optional: single-user invocation for manual testing
    let target: string | null = null;
    try { const j = await req.json(); target = j?.user_id ?? null; } catch { /* ignore */ }

    let users: string[];
    if (target) {
      users = [target];
    } else {
      // Iterate distinct users with any entity_link activity in last 7 days
      const since = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString();
      const { data } = await sb
        .from("entity_links")
        .select("user_id")
        .gte("created_at", since)
        .limit(5000);
      users = [...new Set(((data ?? []) as any[]).map((r) => r.user_id))];
    }

    let total = 0;
    for (const u of users) total += await watchForUser(sb, u);

    return new Response(JSON.stringify({ ok: true, users: users.length, drafted: total }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sherlock-watch", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
