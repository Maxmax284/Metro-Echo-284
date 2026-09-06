import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
import { attemptUndo } from "../_shared/actionRollback.ts";
// actions-transition: validate a state transition for an action and write events + audit.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";


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
    const user = await resolveUser(req, supabase as any);
    if (!user) return unauthorized();

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

    // High-risk approval gate: require explicit confirmation phrase
    if (from === "staged" && to_status === "approved" && action.risk === "high") {
      if ((reason ?? "").trim().toLowerCase() !== "approve") {
        return new Response(JSON.stringify({ error: "high-risk approval requires confirmation phrase 'approve'" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Rollback actually reverses the side effect. If an action advertises that
    // it can be undone and the undo fails, the status does not move — a receipt
    // that says "undone" must mean the world changed back.
    let undo: { undone: boolean; mode: string; detail: string } | null = null;
    if (to_status === "rolled_back") {
      const executorId = action.payload?.executor_id ?? null;
      let executor: { kind: string; config: Record<string, unknown> } | null = null;
      if (executorId) {
        const { data } = await supabase
          .from("action_executors")
          .select("kind, config")
          .eq("id", executorId)
          .maybeSingle();
        executor = (data as typeof executor) ?? null;
      }
      undo = await attemptUndo({
        executorKind: executor?.kind ?? null,
        executorConfig: executor?.config ?? null,
        result: (action.result ?? {}) as Record<string, unknown>,
      });
      if (!undo.undone && action.rollback_available) {
        await supabase.from("audit_log").insert({
          user_id: user.id,
          entity_type: "action",
          entity_id: action_id,
          organization_id: action.organization_id ?? null,
          event: "rollback.failed",
          payload: { detail: undo.detail, mode: undo.mode },
        });
        return new Response(JSON.stringify({ error: `Couldn't undo it: ${undo.detail}` }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const patch: Record<string, unknown> = { status: to_status };
    if (to_status === "approved" && action.risk === "high") patch.risk_acknowledged_at = new Date().toISOString();
    if (to_status === "executed") patch.executed_at = new Date().toISOString();
    if (to_status === "rolled_back") {
      patch.rolled_back_at = new Date().toISOString();
      patch.rollback_available = false;
      patch.rollback_token = null;
    }

    const { error: uErr } = await supabase.from("actions").update(patch).eq("id", action_id);
    if (uErr) throw uErr;

    await supabase.from("action_events").insert({
      user_id: user.id,
      action_id,
      from_status: from,
      to_status,
      actor: "user",
      reason: undo ? `${reason ?? "user rollback"} (${undo.mode})` : reason ?? null,
    });
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "action",
      entity_id: action_id,
      // Receipts live in the scope the work happened in, not always Personal.
      organization_id: action.organization_id ?? null,
      event: `transition:${from}->${to_status}`,
      payload: {
        reason: reason ?? null,
        undo: undo ? { undone: undo.undone, mode: undo.mode, detail: undo.detail } : null,
        /* The receipt carries the draft's own story forward: what it was, where
           it came from, and which source it stood on. Read from the action row
           only — never re-derived here. */
        title: action.title ?? null,
        source: action.source ?? null,
        drafted_at: action.created_at ?? null,
        provenance: (action.payload as Record<string, unknown> | null)?.provenance ?? null,
      },
    });

    return new Response(JSON.stringify({ ok: true, status: to_status, undo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
