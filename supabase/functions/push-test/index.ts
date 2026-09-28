import { corsHeaders } from "../_shared/http.ts";
// push-test: send a one-off test push to all of the caller's subscriptions.
// User-initiated only. Bypasses quiet hours (the user explicitly tapped Test).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { sendWebPush } from "../_shared/webpush.ts";


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const token = authHeader.replace("Bearer ", "");
  const { data: claimsData, error: authErr } = await userClient.auth.getUser(token);
  if (authErr || !claimsData?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = claimsData.user.id as string;

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "";
  if (!vapidPublic || !vapidPrivate || !vapidSubject) {
    return new Response(JSON.stringify({ error: "Push not configured" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use service role to read subs + write audit (RLS-safe: filter by userId).
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failure_count")
    .eq("user_id", userId);

  if (!subs || subs.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: "no_subscriptions" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload = {
    title: "Echo · Test",
    body: "Push is working. Tap to open the platform.",
    tag: "vanta-test",
    url: "/",
    data: { test: true },
  };

  let sent = 0; let failed = 0; let expired = 0;
  for (const s of subs) {
    const r = await sendWebPush(
      { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth },
      payload,
      { vapidPublicKey: vapidPublic, vapidPrivateKey: vapidPrivate, vapidSubject },
    );
    if (r.ok) {
      sent++;
      await admin.from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0, last_error: null })
        .eq("id", s.id);
    } else if (r.shouldDelete) {
      expired++;
      await admin.from("push_subscriptions").delete().eq("id", s.id);
    } else {
      failed++;
      await admin.from("push_subscriptions")
        .update({ last_error: r.error ?? `status ${r.status}`, failure_count: (s.failure_count ?? 0) + 1 })
        .eq("id", s.id);
    }
  }

  await admin.from("audit_log").insert({
    user_id: userId,
    entity_type: "push",
    event: "push.test_sent",
    payload: { sent, failed, expired, sub_count: subs.length },
  });

  return new Response(JSON.stringify({ sent, failed, expired, sub_count: subs.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
