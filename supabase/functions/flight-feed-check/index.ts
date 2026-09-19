// flight-feed-check — one throwaway read to prove the AeroAPI key answers.
// Read only. Deleted once the feed is confirmed.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { askAero } from "../_shared/aeroApi.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const body = await req.json().catch(() => ({}));
  const key = Deno.env.get("AEROAPI_KEY") ?? Deno.env.get("FLIGHTAWARE_API_KEY") ?? "";
  try {
    const live = await askAero(key, String(body.flight_no ?? "TG637"), String(body.flight_date ?? "2026-09-20"));
    return new Response(JSON.stringify({ configured: !!key, live }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ configured: !!key, error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
