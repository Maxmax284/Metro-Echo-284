// weather-tick — the hourly instrument pass for conditions watches.
//
// The 6-hour sweep reads the news; this tick reads the sky. Conditions move
// even when the news doesn't, so once an hour every live conditions watch
// gets its Now line re-read from Open-Meteo and the board never shows a
// stale sky. The advisory tail of the sitrep is left byte-for-byte alone —
// news stays on the sweep's cadence, instruments on this one.
//
// The lock-in: a conditions watch that still matches a stamped ground gets
// its stop_at rolled forward every tick, so your home-ground watch does not
// quietly die at the 14-day mark. A real move clears the match (the ground
// changes, the name no longer matches) and the normal stop returns — a
// temporary place never becomes permanent memory.
//
// Cron-called (hourly) and safe to poke by hand. Notification of state only:
// it writes last_read, telemetry_at and stop_at — nothing else moves.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/http.ts";
import { fetchMeteo, looksLikeWeather, weatherText } from "../_shared/weatherRead.ts";

const LIVE_FIX_SOURCES = ["device", "map_picker", "manual_search", "nearby_suggestion", "manual_fix"];
const OPEN_STATES = ["watching", "on_it", "needs_you", "waiting"];
const ROLL_FORWARD_DAYS = 14;

type PlaceRow = {
  id: string;
  label: string | null;
  country: string | null;
  geo: Record<string, unknown> | null;
  category: string | null;
};

/** Name candidates for a place label — same drift tolerance as the station
    page ("Ko Samui" vs "Koh Samui"): full first segment plus the distinctive
    last word when it is long enough to be safe. */
function nameCandidates(label: string): string[] {
  const segment = label.split(",")[0].trim();
  const words = segment.split(/\s+/).filter(Boolean);
  const lastWord = words[words.length - 1] ?? segment;
  return [...new Set([segment, ...(lastWord.length >= 4 ? [lastWord] : [])])];
}

/** The live block of a sitrep, assembled exactly the way watch-sweep does it:
    Now line, Today line, then the checked-when header. */
function liveBlock(telemetry: string): string {
  const tl = telemetry.split("\n");
  return [tl[1], tl[2], tl[0]].filter(Boolean).join("\n").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: watchRows, error } = await admin
      .from("watches")
      .select("id,user_id,organization_id,goal,last_read")
      .eq("kind", "web_search")
      .in("state", OPEN_STATES)
      .limit(100);
    if (error) return json({ error: error.message }, 500);

    const conditions = (watchRows ?? []).filter((w) => looksLikeWeather(w.goal ?? ""));
    const now = new Date();
    const rollTo = new Date(now.getTime() + ROLL_FORWARD_DAYS * 86400_000).toISOString();

    let refreshed = 0;
    let locked = 0;
    const skipped: Array<{ id: string; why: string }> = [];

    for (const watch of conditions.slice(0, 50)) {
      /* Which stamped ground is this watch about? Name-match against the
         person's genuine fixes — never a saved reading place. */
      const { data: places } = await admin
        .from("awareness_places")
        .select("id,label,country,geo,category")
        .eq("user_id", watch.user_id)
        .filter("geo->>source", "in", `(${LIVE_FIX_SOURCES.map((s) => `"${s}"`).join(",")})`)
        .order("stamped_at", { ascending: false, nullsFirst: false })
        .order("updated_at", { ascending: false })
        .limit(10);

      const goal = (watch.goal ?? "").toLowerCase();
      const match = ((places ?? []) as PlaceRow[]).find((p) => {
        if (p.category === "reading") return false;
        const label = String(p.label ?? "");
        if (!label) return false;
        return nameCandidates(label).some((c) => goal.includes(c.toLowerCase()));
      });

      if (!match) {
        skipped.push({ id: watch.id, why: "no_stamped_ground_match" });
        continue;
      }
      const lat = Number(match.geo?.lat);
      const lon = Number(match.geo?.lon ?? match.geo?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        skipped.push({ id: watch.id, why: "ground_has_no_coordinates" });
        continue;
      }

      const meteo = await fetchMeteo(lat, lon).catch(() => null);
      if (!meteo?.current) {
        skipped.push({ id: watch.id, why: "telemetry_down" });
        continue;
      }

      const telemetry = weatherText(
        { label: String(match.label), note: "your stamped ground", lat, lon },
        meteo,
      );
      const live = liveBlock(telemetry);

      /* Preserve the advisory tail exactly; only the instrument block moves. */
      const prior = String(watch.last_read ?? "");
      const advisorySplit = prior.split("\nAdvisory: ");
      const advisory = advisorySplit.length > 1 ? advisorySplit.slice(1).join("\nAdvisory: ").trim() : "";
      const lastRead = (advisory ? `${live}\nAdvisory: ${advisory}` : live).slice(0, 900);

      const { error: upErr } = await admin
        .from("watches")
        .update({
          last_read: lastRead,
          telemetry_at: now.toISOString(),
          stop_at: rollTo,
        })
        .eq("id", watch.id);
      if (upErr) {
        skipped.push({ id: watch.id, why: `update_${upErr.message}`.slice(0, 120) });
        continue;
      }
      refreshed += 1;
      locked += 1;
    }

    return json({ ok: true, conditions: conditions.length, refreshed, locked, skipped });
  } catch (e) {
    console.error("weather-tick error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
