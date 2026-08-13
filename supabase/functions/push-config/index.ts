import { corsHeaders } from "../_shared/http.ts";
// push-config: returns the VAPID public key for the browser to subscribe.
// The public key is non-secret by design (browsers send it as applicationServerKey).
// Private key stays in edge env and is only used by the sender.
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
  const { data: claimsData, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !claimsData?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? null;
  const configured = !!(publicKey && Deno.env.get("VAPID_PRIVATE_KEY") && Deno.env.get("VAPID_SUBJECT"));

  return new Response(JSON.stringify({ public_key: publicKey, configured }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
