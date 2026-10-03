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
import { resolveWatchPlace } from "../_shared/watchPlace.ts";

const OPEN_STATES = ["watching", "on_it", "needs_you", "waiting"];
const ROLL_FORWARD_DAYS = 14;

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
      .select("id,user_id,organization_id,goal,last_read,success_when")
      .eq("kind", "web_search")
      .in("state", OPEN_STATES)
      .limit(100);
    if (error) return json({ error: error.message }, 500);

    const conditions = (watchRows ?? []).filter((w) =>
      looksLikeWeather(`${w.goal ?? ""} ${String((w as { success_when?: { query?: string } }).success_when?.query ?? "")}`)
    );
    const now = new Date();
    const rollTo = new Date(now.getTime() + ROLL_FORWARD_DAYS * 86400_000).toISOString();

    let refreshed = 0;
    let locked = 0;
    const skipped: Array<{ id: string; why: string }> = [];

    for (const watch of conditions.slice(0, 50)) {
      /* Which place is this watch about? Stamped ground first (that match
         carries the lock-in), then any named place on the board, then the
         watch's own words geocoded — every conditions watch gets its own
         sky, not just the home ground's. */
      const watchText_ = `${watch.goal ?? ""} ${String(
        (watch as { success_when?: { query?: string } }).success_when?.query ?? "",
      )}`;
      const place = await resolveWatchPlace(admin, watch.user_id, watchText_);
      if (!place) {
        skipped.push({ id: watch.id, why: "no_place_resolved" });
        continue;
      }

      const meteo = await fetchMeteo(place.lat, place.lon).catch(() => null);
      if (!meteo?.current) {
        skipped.push({ id: watch.id, why: "telemetry_down" });
        continue;
      }

      const telemetry = weatherText(place, meteo);
      const live = liveBlock(telemetry);

      /* Preserve the advisory tail exactly; only the instrument block moves. */
      const prior = String(watch.last_read ?? "");
      const advisorySplit = prior.split("\nAdvisory: ");
      const advisory = advisorySplit.length > 1 ? advisorySplit.slice(1).join("\nAdvisory: ").trim() : "";
      const lastRead = (advisory ? `${live}\nAdvisory: ${advisory}` : live).slice(0, 900);

      /* The lock-in belongs to genuine fixes only: a watch reading the sky
         over a stamped ground rolls its stop forward; a watch about any
         other place keeps its natural lifespan — a temporary place never
         becomes permanent memory. */
      const { error: upErr } = await admin
        .from("watches")
        .update({
          last_read: lastRead,
          telemetry_at: now.toISOString(),
          ...(place.isStampedGround ? { stop_at: rollTo } : {}),
        })
        .eq("id", watch.id);
      if (upErr) {
        skipped.push({ id: watch.id, why: `update_${upErr.message}`.slice(0, 120) });
        continue;
      }
      refreshed += 1;
      if (place.isStampedGround) locked += 1;
    }

    return json({ ok: true, conditions: conditions.length, refreshed, locked, skipped });
  } catch (e) {
    console.error("weather-tick error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
