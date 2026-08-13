import { corsHeaders } from "../_shared/http.ts";
// push-diagnose: honest server-side view of push readiness.
// Returns the 5 axes the UI needs to decide whether to claim "Push ON".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !claims?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claims.user.id;

  // Optional: client may pass its current endpoint so we know which sub to inspect.
  let endpoint: string | null = null;
  if (req.method === "POST") {
    try {
      const body = await req.json();
      endpoint = typeof body?.endpoint === "string" ? body.endpoint : null;
    } catch { /* no body, fine */ }
  }

  const vapidConfigured = !!(
    Deno.env.get("VAPID_PUBLIC_KEY") &&
    Deno.env.get("VAPID_PRIVATE_KEY") &&
    Deno.env.get("VAPID_SUBJECT")
  );

  // Pull this user's subs (RLS scopes to them)
  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, failure_count, last_error, last_used_at, created_at")
    .order("created_at", { ascending: false });

  const all = subs ?? [];
  const current = endpoint ? all.find((s) => s.endpoint === endpoint) : all[0];

  const subscriptionStored = !!current;
  const failureCount = current?.failure_count ?? 0;
  const lastError = current?.last_error ?? null;
  const lastUsedAt = current?.last_used_at ?? null;
  // Stale = repeated send failures (web push 410/404 typically). 3+ = needs re-enable.
  const staleSubscription = subscriptionStored && failureCount >= 3;

  // Last delivery attempt across any sub
  const { data: lastAudit } = await supabase
    .from("audit_log")
    .select("event, payload, created_at")
    .eq("user_id", userId)
    .eq("entity_type", "push")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastDeliveryAt = lastAudit?.[0]?.created_at ?? lastUsedAt ?? null;
  const lastDeliveryEvent = lastAudit?.[0]?.event ?? null;

  const allGreen =
    vapidConfigured && subscriptionStored && !staleSubscription;

  // Emit a diagnostic audit event so transitions are auditable.
  await supabase.from("audit_log").insert({
    user_id: userId,
    entity_type: "push",
    event: "push.diagnosed",
    payload: {
      vapidConfigured,
      subscriptionStored,
      staleSubscription,
      failureCount,
      lastError,
      allGreen,
    },
  });

  return new Response(JSON.stringify({
    vapidConfigured,
    subscriptionStored,
    staleSubscription,
    failureCount,
    lastError,
    lastDeliveryAt,
    lastDeliveryEvent,
    subscriptionCount: all.length,
    allGreen,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
