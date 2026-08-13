import { corsHeaders } from "../_shared/http.ts";
// ambient-pulse: generates proactive nudges on app open.
// - Overdue commitments
// - Commitments due today
// - Approved actions awaiting execution
// - Stale captures with no follow-up
// - Briefing-on-arrival when location moves significantly from last known place
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


type NudgeIn = {
  kind: string;
  title: string;
  body?: string;
  related_entity_type?: string;
  related_entity_id?: string;
  priority?: number;
  dedupe_key?: string;
  expires_at?: string;
};

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const la1 = a.lat * Math.PI / 180;
  const la2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const token = auth.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getUser(token);
    if (claimsErr || !claimsData?.user?.id) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = { id: claimsData.user.id as string };

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", { _user_id: user.id, _bucket: "ambient-pulse", _limit: 12, _window_seconds: 60 });
    if (allowed === false) {
      return new Response(JSON.stringify({ proposed: 0, created: 0, rate_limited: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const here: { lat: number; lon: number } | null =
      body?.geo && typeof body.geo.lat === "number" && typeof body.geo.lon === "number"
        ? { lat: body.geo.lat, lon: body.geo.lon }
        : null;

    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
    const dayKey = now.toISOString().slice(0, 10);
    const nudges: NudgeIn[] = [];

    // 1. Overdue commitments
    const { data: overdue } = await supabase
      .from("commitments")
      .select("id, summary, due_at")
      .eq("status", "open")
      .lt("due_at", now.toISOString())
      .order("due_at", { ascending: true })
      .limit(5);

    for (const c of overdue ?? []) {
      nudges.push({
        kind: "commitment_overdue",
        title: "Overdue commitment",
        body: c.summary,
        related_entity_type: "commitment",
        related_entity_id: c.id,
        priority: 90,
        dedupe_key: `overdue:${c.id}:${dayKey}`,
      });
    }

    // 2. Commitments due today
    const { data: dueToday } = await supabase
      .from("commitments")
      .select("id, summary, due_at")
      .eq("status", "open")
      .gte("due_at", now.toISOString())
      .lte("due_at", todayEnd.toISOString())
      .limit(5);

    for (const c of dueToday ?? []) {
      nudges.push({
        kind: "commitment_due_today",
        title: "Due today",
        body: c.summary,
        related_entity_type: "commitment",
        related_entity_id: c.id,
        priority: 75,
        dedupe_key: `due_today:${c.id}:${dayKey}`,
      });
    }

    // 3. Approved actions awaiting execution
    const { data: ready } = await supabase
      .from("actions")
      .select("id, title")
      .eq("status", "approved")
      .order("updated_at", { ascending: false })
      .limit(5);

    for (const a of ready ?? []) {
      nudges.push({
        kind: "action_ready",
        title: "Ready to execute",
        body: a.title,
        related_entity_type: "action",
        related_entity_id: a.id,
        priority: 70,
        dedupe_key: `action_ready:${a.id}:${dayKey}`,
      });
    }

    // 4. Stale captures (notes from >3 days ago with no autolinks/commitments referencing them)
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleNotes } = await supabase
      .from("notes")
      .select("id, title, body, created_at")
      .lt("created_at", threeDaysAgo)
      .order("created_at", { ascending: false })
      .limit(2);

    for (const n of staleNotes ?? []) {
      nudges.push({
        kind: "note_stale",
        title: "Revisit a capture",
        body: n.title || (n.body ?? "").slice(0, 120),
        related_entity_type: "note",
        related_entity_id: n.id,
        priority: 30,
        dedupe_key: `note_stale:${n.id}:${dayKey}`,
      });
    }

    // 5. Briefing-on-arrival
    if (here) {
      const { data: places } = await supabase
        .from("awareness_places")
        .select("id, label, geo, updated_at")
        .order("updated_at", { ascending: false })
        .limit(20);

      let nearest: { id: string; label: string; km: number } | null = null;
      for (const p of places ?? []) {
        const g = p.geo as { lat?: number; lon?: number } | null;
        if (!g || typeof g.lat !== "number" || typeof g.lon !== "number") continue;
        const km = haversineKm(here, { lat: g.lat, lon: g.lon });
        if (!nearest || km < nearest.km) nearest = { id: p.id, label: p.label, km };
      }

      const FAR_KM = 5;
      if (!nearest || nearest.km > FAR_KM) {
        nudges.push({
          kind: "arrival_new_area",
          title: "You appear to be somewhere new",
          body: nearest
            ? `Closest known place is ${nearest.label} (~${nearest.km.toFixed(1)} km away). Capture this spot for a briefing.`
            : "Capture this location to get an awareness briefing.",
          priority: 60,
          dedupe_key: `arrival:${dayKey}:${here.lat.toFixed(2)},${here.lon.toFixed(2)}`,
          expires_at: todayEnd.toISOString(),
        });
      } else if (nearest.km <= FAR_KM) {
        // Returning to a known place — surface latest briefing if it exists
        const { data: latest } = await supabase
          .from("awareness_briefings")
          .select("id, section, generated_at")
          .eq("place_id", nearest.id)
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latest) {
          nudges.push({
            kind: "arrival_known",
            title: `Back at ${nearest.label}`,
            body: `Latest briefing section: ${latest.section}.`,
            related_entity_type: "place",
            related_entity_id: nearest.id,
            priority: 40,
            dedupe_key: `arrival_known:${nearest.id}:${dayKey}`,
            expires_at: todayEnd.toISOString(),
          });
        }
      }
    }

    // 6. Proactive synthesis — detect repeated tag themes over last 7 days that
    // have NOT already been investigated. One suggestion per day, lowest priority
    // so it never shouts.
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentNotes } = await supabase
      .from("notes")
      .select("id, tags, created_at")
      .gte("created_at", sevenDaysAgo)
      .limit(200);

    const tagCount = new Map<string, number>();
    for (const n of recentNotes ?? []) {
      for (const t of (n.tags ?? []) as string[]) {
        if (!t || t.startsWith("via:") || ["imported", "upload", "email", "telegram"].includes(t)) continue;
        tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
      }
    }
    const themes = [...tagCount.entries()]
      .filter(([, c]) => c >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 1);

    for (const [tag, count] of themes) {
      // Skip if an investigation already touches this tag this week
      const { data: recentInv } = await supabase
        .from("investigations")
        .select("id, question")
        .gte("created_at", sevenDaysAgo)
        .ilike("question", `%${tag}%`)
        .limit(1);
      if (recentInv && recentInv.length) continue;
      nudges.push({
        kind: "synthesis_suggestion",
        title: `Pattern: "${tag}" came up ${count}×`,
        body: `Recurring theme in this week's captures. Run Sherlock to synthesize?`,
        priority: 35,
        dedupe_key: `synthesis:${tag}:${dayKey}`,
        expires_at: todayEnd.toISOString(),
      });
    }

    // Insert (dedupe_key unique partial index will silently skip duplicates)
    let created = 0;
    if (nudges.length) {
      const rows = nudges.map((n) => ({ ...n, user_id: user.id }));
      const { data: inserted, error } = await supabase
        .from("nudges")
        .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) console.warn("nudges upsert", error);
      created = inserted?.length ?? 0;
    }

    // Auto-expire stale dismissed/expired
    await supabase
      .from("nudges")
      .delete()
      .eq("user_id", user.id)
      .lt("expires_at", now.toISOString());

    return new Response(JSON.stringify({ proposed: nudges.length, created }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ambient-pulse error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
