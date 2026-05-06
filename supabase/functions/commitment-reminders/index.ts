// commitment-reminders: sweep due/overdue commitments and emit reminder events into audit_log.
// Designed to be called by pg_cron on a schedule. Iterates per user found in commitments.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    // Use service role to scan across all users (cron context, no JWT).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date().toISOString();
    // Pull commitments that are open and (remind_at <= now OR (due_at <= now+24h AND remind_at is null))
    const in24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: due, error } = await supabase
      .from("commitments")
      .select("id, user_id, summary, due_at, remind_at, last_reminded_at, priority")
      .eq("status", "open")
      .or(`remind_at.lte.${now},and(due_at.lte.${in24h},remind_at.is.null)`)
      .limit(500);
    if (error) throw error;

    let emitted = 0;
    for (const c of due ?? []) {
      // Throttle: don't re-remind within 6 hours
      if (c.last_reminded_at && Date.now() - new Date(c.last_reminded_at).getTime() < 6 * 60 * 60 * 1000) continue;
      const overdue = c.due_at && new Date(c.due_at).getTime() < Date.now();
      const { error: aErr } = await supabase.from("audit_log").insert({
        user_id: c.user_id,
        entity_type: "commitment",
        entity_id: c.id,
        event: overdue ? "commitment.overdue" : "commitment.due_soon",
        payload: { summary: c.summary, due_at: c.due_at, priority: c.priority },
      });
      if (aErr) continue;
      await supabase.from("commitments").update({ last_reminded_at: now }).eq("id", c.id);
      emitted++;
    }

    return new Response(JSON.stringify({ swept: due?.length ?? 0, emitted }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
