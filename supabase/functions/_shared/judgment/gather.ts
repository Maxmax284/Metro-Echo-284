// gather — the one place that turns recorded rows into judgment input.
//
// Ask and Telegram both call this, so there is a single path from evidence to
// judgement. Nothing here invents a value: if a row is missing, the field stays
// off and the judgment block simply says less.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type ArchetypeEvidence, inferArchetypes } from "./archetype.ts";
import { type PlatformRow, platformRoles } from "./roleMap.ts";
import type { JudgmentInput } from "./index.ts";

type Sb = SupabaseClient;

const DISRUPTED = ["cancelled", "diverted", "delayed", "late"];

/** Evidence for the shape of today, read from what is actually filed. */
export async function gatherJudgment(
  sb: Sb,
  userId: string,
  text: string,
  now: Date = new Date(),
): Promise<JudgmentInput> {
  const evidence: ArchetypeEvidence = { text };
  const soon = new Date(now.getTime() + 24 * 60 * 60_000).toISOString();
  const today = now.toISOString().slice(0, 10);

  try {
    const { data: flights } = await sb
      .from("flight_plans")
      .select("depart_on, status, latest_reading")
      .eq("user_id", userId)
      .gte("depart_on", today)
      .lte("depart_on", soon.slice(0, 10))
      .limit(10);
    const rows = (flights ?? []) as any[];
    if (rows.length) {
      evidence.flightWithin24h = true;
      evidence.flightDisrupted = rows.some((r) => {
        const said = `${r.status ?? ""} ${JSON.stringify(r.latest_reading ?? {})}`.toLowerCase();
        return DISRUPTED.some((w) => said.includes(w));
      });
    }
  } catch {
    /* No flight rail read is better than a guessed one. */
  }

  const archetypes = inferArchetypes(evidence, now);
  const platforms: PlatformRow[] = platformRoles({});

  return {
    archetypes: archetypes.length ? archetypes : null,
    platforms,
    now,
  };
}
