// trip-session — the one door every surface uses to start, add to, and close a
// trip. Telegram already goes through _shared/tripSession.ts; this puts the app
// on the same road instead of writing trip rows on its own. Same rules, same
// receipts, one record either way.
//
// Deliberate only: nothing here opens a session because someone moved. Every
// intent is an explicit tap or an explicit message.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { resolveUser } from "../_shared/authContext.ts";
import { unauthorized } from "../_shared/errors.ts";
import { corsHeaders } from "../_shared/http.ts";
import {
  activeSession,
  appendPoint,
  endSession,
  holdSession,
  startSession,
} from "../_shared/tripSession.ts";

const Fix = z.object({
  lat: z.number(),
  lon: z.number(),
  accuracy_m: z.number().nullable().optional(),
  kind: z.string().max(40).optional(),
  label: z.string().max(200).nullable().optional(),
});

const Body = z.object({
  intent: z.enum(["read", "start", "point", "end", "hold"]),
  organization_id: z.string().uuid().nullable().optional(),
  label: z.string().max(200).nullable().optional(),
  purpose: z.string().max(80).nullable().optional(),
  start_label: z.string().max(200).nullable().optional(),
  end_label: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  fix: Fix.nullable().optional(),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const user = await resolveUser(req, authed as any);
    if (!user) return unauthorized();

    const parsed = Body.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const input = parsed.data;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const scope = { userId: user.id, orgId: input.organization_id ?? null };
    const via = "app";

    if (input.intent === "read") {
      const read = await activeSession(admin, scope);
      return json({ ...read, via });
    }

    if (input.intent === "start") {
      const started = await startSession(admin, scope, {
        label: input.label ?? null,
        purpose: input.purpose ?? null,
        startLabel: input.start_label ?? null,
        notes: input.notes ?? null,
        via,
      });
      if (!started) return json({ error: "could_not_start" }, 500);
      /* A start fix is a point like any other — only if the surface had one. */
      if (input.fix && !started.reused) {
        await appendPoint(admin, scope, started.trip.id, {
          ...input.fix,
          kind: input.fix.kind ?? "start",
          label: input.start_label ?? input.fix.label ?? null,
        });
      }
      const read = await activeSession(admin, scope);
      return json({ ...read, reused: started.reused, via });
    }

    if (input.intent === "point") {
      const open = await activeSession(admin, scope);
      if (!open.trip) return json({ error: "no_open_trip" }, 409);
      if (!input.fix) return json({ error: "no_fix" }, 400);
      const point = await appendPoint(admin, scope, open.trip.id, input.fix);
      const read = await activeSession(admin, scope);
      return json({ ...read, point, via });
    }

    if (input.intent === "end") {
      /* Close on the last real fix the surface could give us, then end. */
      const open = await activeSession(admin, scope);
      if (!open.trip) return json({ error: "no_open_trip" }, 409);
      if (input.fix) {
        await appendPoint(admin, scope, open.trip.id, {
          ...input.fix,
          kind: input.fix.kind ?? "end",
          label: input.end_label ?? input.fix.label ?? null,
        });
      }
      const closed = await endSession(admin, scope, {
        endLabel: input.end_label ?? null,
        via,
      });
      if (!closed) return json({ error: "no_open_trip" }, 409);
      return json({ trip: closed.trip, distanceM: closed.distanceM, via });
    }

    const held = await holdSession(admin, scope, via);
    if (!held) return json({ error: "no_open_trip" }, 409);
    return json({ trip: held, via });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
