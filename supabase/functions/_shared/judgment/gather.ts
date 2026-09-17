// gather — the one place that turns recorded rows into judgment input.
//
// Ask and Telegram both call this, so there is a single path from evidence to
// judgement. Nothing here invents a value: if a row is missing, the field stays
// off and the judgment block simply says less.
import { type BodyLoad, readBodyLoad } from "./bodyLoad.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type ArchetypeEvidence, inferArchetypes } from "./archetype.ts";
import { type PlatformRow, platformRoles } from "./roleMap.ts";
import type { JudgmentInput } from "./index.ts";
import { worldFacts } from "./worldContext.ts";

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

  /* Rest and effort, from readings the person's own phone sent. Consent is
     already enforced at the door, so anything stored is fair to reason with —
     and when nothing is stored, this stays null and Echo says nothing. */
  let bodyLoad: BodyLoad | null = null;
  try {
    const { data: readings } = await sb
      .from("wearable_readings")
      .select("kind, value, measured_at")
      .eq("user_id", userId)
      .gte("measured_at", new Date(now.getTime() - 14 * 86_400_000).toISOString())
      .order("measured_at", { ascending: false })
      .limit(500);
    const rows = ((readings ?? []) as any[]).map((r) => ({
      kind: String(r.kind),
      value: Number(r.value),
      measured_at: String(r.measured_at),
    }));
    if (rows.length) {
      const load = readBodyLoad(rows, now);
      if (load.sleepMinutes !== null || load.trainedTodayMinutes !== null) bodyLoad = load;
    }
  } catch {
    /* No body read is better than a guessed one. */
  }

  /* Where they are, and what Echo actually keeps about that place. A region row
     replaces the country row for the same topic; a place Echo does not hold
     notes for contributes nothing rather than a generalisation. */
  let world: JudgmentInput["world"] = null;
  let local: string | null = null;
  try {
    const { data: state } = await sb
      .from("place_state")
      .select("role, country, region, metro, locality, level, confidence, source, fixed_at, evidence, conflicts")
      .eq("user_id", userId)
      .eq("role", "current")
      .maybeSingle();

    let country = (state as any)?.country ?? null;
    let region = (state as any)?.region ?? null;
    let words = [(state as any)?.locality, (state as any)?.metro, region, country]
      .filter((p: unknown) => typeof p === "string" && p.trim())
      .slice(0, 2)
      .join(", ");

    if (!country) {
      const { data: places } = await sb
        .from("awareness_places")
        .select("label, country, region, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(1);
      const row = (places ?? [])[0] as any;
      if (row) {
        country = row.country ?? null;
        region = row.region ?? null;
        words = [row.label, row.region, row.country].filter((p: unknown) => typeof p === "string" && p.trim()).slice(0, 2).join(", ");
      }
    }

    if (country) {
      const facts = worldFacts(country, region);
      if (facts.length) world = { facts, country };
      const conflicts = (state as any)?.conflicts;
      const contested = Array.isArray(conflicts) && conflicts.length > 0;
      if (words) {
        local = contested
          ? `Where they are: sources disagree. Say both readings and pick neither.`
          : `Where they are: ${words}.`;
      }
    }
  } catch {
    /* No place read is better than a guessed one. */
  }

  const archetypes = inferArchetypes(evidence, now);
  const platforms: PlatformRow[] = platformRoles({});

  return {
    sense: local ? { local } : null,
    archetypes: archetypes.length ? archetypes : null,
    platforms,
    bodyLoad,
    world,
    now,
  };
}
