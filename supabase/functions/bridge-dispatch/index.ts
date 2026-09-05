// bridge-dispatch — drain the outbound bridge queue (Echo → LMT Camp State).
//
// Runs on a schedule and can be poked by hand. Notification only: it forwards
// awareness updates Echo already recorded. It never executes anything and it
// never accepts instructions back.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "../_shared/http.ts";
import { drainBridgeQueue, resolveBridgeTarget } from "../_shared/outboundBridge.ts";

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

    if (!resolveBridgeTarget("ground_truth_hub")) {
      return json({ ok: true, configured: false, note: "Hub bridge is not connected yet." });
    }

    const summary = await drainBridgeQueue(admin, 25);
    return json({ ok: true, configured: true, ...summary });
  } catch (e) {
    console.error("bridge-dispatch error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
