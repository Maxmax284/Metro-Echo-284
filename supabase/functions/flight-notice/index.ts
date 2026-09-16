// flight-notice — flight information out of something already readable.
//
// Doctrine:
//   - Recognition only. It reads text handed to it, files what it recognises as
//     a draft with its evidence, and asks once whose it is. It logs into
//     nothing, fetches nothing behind a password, and books nothing.
//   - Every draft it writes waits on the person. None of them reach the board.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "https://esm.sh/zod@3.23.8";
import { noticeFlights } from "../_shared/flightNotice.ts";
import { recognizeFlights } from "../_shared/flightRecognize.ts";

const BodySchema = z.object({
  text: z.string().min(4).max(20_000),
  source: z.enum(["mail", "telegram", "calendar", "pasted", "document"]).default("pasted"),
  sender_name: z.string().max(200).optional(),
  sender_email: z.string().max(320).optional(),
  link: z.string().max(2_000).optional(),
  organization_id: z.string().uuid().nullable().optional(),
  /** Read it without filing anything, so the desk can show what it would find. */
  dry_run: z.boolean().optional(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;

    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const asUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: who } = await asUser.auth.getUser();
    const user = who?.user;
    if (!user) return json({ error: "unauthorized" }, 401);

    if (body.dry_run) {
      const recognition = recognizeFlights(body.text, { today: new Date().toISOString().slice(0, 10) });
      return json({ recognition, filed: false });
    }

    const result = await noticeFlights(
      asUser as never,
      { userId: user.id, orgId: body.organization_id ?? null },
      {
        text: body.text,
        source: body.source,
        sender:
          body.sender_name || body.sender_email
            ? { name: body.sender_name ?? null, email: body.sender_email ?? null }
            : null,
        link: body.link ?? null,
        myEmails: user.email ? [user.email] : [],
        today: new Date().toISOString().slice(0, 10),
      },
    );
    return json({ ...result, filed: true });
  } catch (e) {
    console.error("flight-notice", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
