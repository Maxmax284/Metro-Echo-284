// actions-transition: validate a state transition for an action and write events + audit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const Body = z.object({
  action_id: z.string().uuid(),
  to_status: z.enum(["proposed", "staged", "approved", "executed", "audited", "rolled_back", "cancelled"]),
  reason: z.string().max(500).optional(),
});

const allowed: Record<string, string[]> = {
  proposed: ["staged", "cancelled"],
  staged: ["approved", "cancelled"],
  approved: ["executed", "cancelled"],
  executed: ["audited", "rolled_back"],
  audited: ["rolled_back"],
  rolled_back: [],
  cancelled: [],
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const parsed = Body.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { action_id, to_status, reason } = parsed.data;

    const { data: action, error: aErr } = await supabase.from("actions").select("*").eq("id", action_id).maybeSingle();
    if (aErr || !action) return new Response(JSON.stringify({ error: "action not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (!(allowed[action.status] ?? []).includes(to_status)) {
      return new Response(JSON.stringify({ error: `invalid transition ${action.status} -> ${to_status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const from = action.status;
    const { error: uErr } = await supabase.from("actions").update({ status: to_status }).eq("id", action_id);
    if (uErr) throw uErr;

    await supabase.from("action_events").insert({
      user_id: user.id,
      action_id,
      from_status: from,
      to_status,
      actor: "user",
      reason: reason ?? null,
    });
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "action",
      entity_id: action_id,
      event: `transition:${from}->${to_status}`,
      payload: { reason: reason ?? null },
    });

    return new Response(JSON.stringify({ ok: true, status: to_status }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
