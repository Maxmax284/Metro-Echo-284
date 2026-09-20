// boarding-pass-read — one look at one boarding pass, kept by nobody.
//
// Doctrine:
//   - The picture is never stored. It arrives in the request, it is read once,
//     and it is gone with the response. No bucket, no row, no payload copy.
//   - Only four fields come back: boarding time, gate, seat, zone. Names,
//     record locators and the barcode are not read out and not returned.
//   - Nothing is saved to the flight. The reading goes back to the person for
//     review; saving is their tap.
//   - A field the pass does not show comes back null. Nothing is worked out from
//     the departure time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const PROMPT = [
  "This is a photo of an airline boarding pass. Read only these four printed fields and return JSON:",
  '{"boarding_time":"HH:MM 24h or null","gate":"string or null","seat":"string or null","zone":"boarding zone or group, string or null"}',
  "Rules: boarding time is the printed BOARDING time, never the departure or take-off time — if only a departure time is printed, return null for boarding_time.",
  "Do not read, guess or return the passenger name, record locator, ticket number, frequent flyer number or barcode.",
  "Do not calculate or infer any field. A field that is not printed is null.",
  "Return JSON only.",
].join(" ");

function pick(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || /^(null|none|n\/a|unknown)$/i.test(s)) return null;
  return s.slice(0, 12);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const user = await resolveUser(req, supabase as never);
    if (!user) return unauthorized();

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      _user_id: user.id,
      _bucket: "boarding-pass-read",
      _limit: 12,
      _window_seconds: 300,
    });
    if (allowed === false) return json({ error: "rate_limited", message: "That is a lot of looks in a few minutes. Try again shortly." }, 429);

    const body = await req.json().catch(() => ({}));
    const image = typeof body?.image === "string" ? body.image : "";
    const planId = typeof body?.plan_id === "string" ? body.plan_id : null;
    if (!image.startsWith("data:image/")) {
      return json({ error: "no_picture", message: "That did not come through as a picture." }, 400);
    }
    if (image.length > 8_000_000) {
      return json({ error: "too_big", message: "That picture is too large to read. Try a smaller one." }, 400);
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) return json({ error: "no_key", message: "Echo cannot read pictures right now." }, 503);

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: PROMPT },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const status = r.status === 429 ? 429 : 502;
      return json({ error: "look_failed", message: "That picture could not be read. Type the details instead." }, status);
    }
    const j = await r.json();
    const text = String(j.choices?.[0]?.message?.content ?? "");
    const m = /\{[\s\S]*\}/.exec(text);
    let parsed: Record<string, unknown> = {};
    try { parsed = m ? JSON.parse(m[0]) : {}; } catch { parsed = {}; }

    const read = {
      boarding_time: pick(parsed.boarding_time),
      gate: pick(parsed.gate),
      seat: pick(parsed.seat),
      zone: pick(parsed.zone),
    };
    const found = Object.entries(read).filter(([, v]) => !!v).map(([k]) => k);

    /* The receipt records that a look happened and which fields it found —
       never the values, never the picture. */
    await admin.from("audit_log").insert({
      user_id: user.id,
      entity_type: planId ? "flight_plan" : "flight",
      entity_id: planId,
      event: "flight.boarding_pass_looked",
      payload: { fields_found: found, picture_kept: false, saved: false },
    });

    return json({ read, found, kept: false });
  } catch (e) {
    return json({ error: "failed", message: e instanceof Error ? e.message : "read failed" }, 500);
  }
});
