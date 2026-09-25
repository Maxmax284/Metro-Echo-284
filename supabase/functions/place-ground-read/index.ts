// place-ground-read — Echo's plain read of where you are, plus a real photo.
// Tap-only. Photo + summary come from Wikipedia (free, no AI). The AI read is
// grounded in that summary and the resolved place names only. 6 reads a day.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { corsHeaders } from "../_shared/http.ts";
import { resolveUser } from "../_shared/authContext.ts";
import { streamAstraText } from "../_shared/aiResponses.ts";

const Body = z.object({
  city: z.string().min(1).max(80),
  region: z.string().max(80).nullable(),
  country: z.string().max(80).nullable(),
  localTime: z.string().max(40).nullable(),
  nearby: z.array(z.string().max(80)).max(8),
  withRead: z.boolean().default(true),
});

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function wiki(title: string) {
  try {
    const r = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      { headers: { "User-Agent": "MetroEcho/1.0 (metroecho.lovable.app)" } },
    );
    if (!r.ok) return null;
    const j = await r.json();
    if (j.type === "disambiguation") return null;
    return {
      title: j.title as string,
      extract: String(j.extract ?? "").slice(0, 900),
      photo: (j.originalimage?.source ?? j.thumbnail?.source ?? null) as string | null,
      url: (j.content_urls?.desktop?.page ?? null) as string | null,
    };
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const user = await resolveUser(req, client as any);
    if (!user) return json({ error: "Sign in first." }, 401);
    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const b = parsed.data;

    const page = (await wiki(b.city)) ?? (b.region ? await wiki(b.region) : null);
    if (!b.withRead) return json({ page, read: null });

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const { count } = await client.from("audit_log").select("id", { count: "exact", head: true })
      .eq("event", "ground_read.composed").gte("created_at", dayAgo);
    if ((count ?? 0) >= 6) return json({ page, read: null, error: "Echo's local read is resting until tomorrow.", limited: true }, 429);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) return json({ page, error: "Echo's local read isn't set up yet." }, 500);

    const facts = [
      `Place: ${[b.city, b.region, b.country].filter(Boolean).join(", ")}`,
      b.localTime ? `Local time: ${b.localTime}` : null,
      b.nearby.length ? `Nearby: ${b.nearby.join(", ")}` : null,
      page?.extract ? `Reference: ${page.extract}` : null,
    ].filter(Boolean).join("\n");

    const { text } = await streamAstraText({
      apiKey: key,
      incomingRunId: req.headers.get("X-Lovable-AIG-Run-ID") ?? undefined,
      messages: [
        {
          role: "system",
          content:
            "You are Echo, a calm field companion. Give the person a read of where they are, East Coast calm: direct, warm, a little dry, never robotic. Write in English. Reply as 4 short lines, each starting with a label: 'The vibe:', 'Getting around:', 'Money & plugs:', 'If it goes sideways:'. Under 90 words total. Use general, well-known facts about the place and country; never invent specific businesses, prices or times. No exclamation marks.",
        },
        { role: "user", content: facts },
      ],
    });

    await client.from("audit_log").insert({
      user_id: user.id, event: "ground_read.composed", entity_type: "place", payload: { city: b.city },
    } as any);
    return json({ page, read: text || null });
  } catch (e) {
    const status = (e as { status?: number }).status ?? 500;
    return json({ error: e instanceof Error ? e.message : "Echo couldn't read the place." }, status);
  }
});
