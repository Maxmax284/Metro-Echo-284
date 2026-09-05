// cadence-sweep — learns how often each project usually moves.
//
// Doctrine:
//   - it reads recorded history only. It never invents an event, never writes
//     to any object, never notifies anybody, never executes anything.
//   - a project without enough history gets no row, so nothing downstream can
//     claim a normal that does not exist.
//   - the stored numbers are the evidence behind any "different from usual"
//     sentence a person later reads.
import { corsHeaders } from "../_shared/http.ts";
import { buildCadence, cadenceRowFor, MIN_SAMPLES } from "../_shared/baseline.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const WINDOW_DAYS = 90;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

    /* One caller may narrow the sweep to themselves; the cron sweeps everyone. */
    let onlyUserId: string | null = null;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader) {
      const asUser = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data } = await asUser.auth.getUser();
      onlyUserId = data?.user?.id ?? null;
    }

    let projectQuery = admin
      .from("projects")
      .select("id, user_id, organization_id")
      .limit(2000);
    if (onlyUserId) projectQuery = projectQuery.eq("user_id", onlyUserId);
    const { data: projects, error: projectError } = await projectQuery;
    if (projectError) return json({ error: projectError.message }, 500);

    let written = 0;
    let skipped = 0;

    for (const project of projects ?? []) {
      /* Movement = anything actually attached to the project. Commitments and
         actions reach a project through project_items, so that one table is
         the honest record of the project moving. */
      const { data: items } = await admin
        .from("project_items")
        .select("created_at")
        .eq("project_id", project.id)
        .gte("created_at", since)
        .limit(1000);

      const stamps: Array<string | null> = (items ?? []).map((r: { created_at: string }) => r.created_at);


      const cadence = buildCadence(stamps);
      if (!cadence) {
        skipped++;
        continue;
      }
      const row = cadenceRowFor("project", project.id, WINDOW_DAYS, cadence);
      const { error } = await admin.from("object_cadence").upsert(
        {
          user_id: project.user_id,
          organization_id: project.organization_id ?? null,
          ...row,
          computed_at: new Date().toISOString(),
        },
        { onConflict: "user_id,object_type,object_id,window_days" },
      );
      if (error) skipped++;
      else written++;
    }

    /* A diff, not a status. */
    const summary =
      written === 0
        ? "No project has enough recorded history yet to say what normal looks like."
        : `Learned the usual pace for ${written} ${written === 1 ? "project" : "projects"}. ${skipped} still need more history (at least ${MIN_SAMPLES + 1} recorded moves).`;

    return json({ written, skipped, window_days: WINDOW_DAYS, summary });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "cadence sweep failed" }, 500);
  }
});
