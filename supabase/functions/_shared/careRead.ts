// careRead — the care answer, from records only.
//
// Doctrine:
//   - This read never hits the map. It answers from the published emergency
//     number for the country on file and the care places the person kept.
//     Looking up new ground is an explicit tap on the Help desk, not something a
//     chat answer does behind the scenes.
//   - Nothing kept, nothing claimed: it says the desk is where to look.
//   - Echo never dials and never books.
type SupabaseClient = { from: (table: string) => any };
import { helpAnswer } from "./localHelp.ts";
import { CARE_LAW } from "./careFinder.ts";

export type CareReadArgs = { place?: string | null };

export async function careRead(
  sb: SupabaseClient,
  scope: { userId: string; orgId: string | null },
  args: CareReadArgs = {},
): Promise<string> {
  const lines: string[] = [];

  /* The country: what the caller named, else the live place on file. */
  let country = (args.place ?? "").trim() || null;
  if (!country) {
    const { data } = await sb
      .from("awareness_places")
      .select("country, label, updated_at")
      .eq("user_id", scope.userId)
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(1);
    country = ((data ?? [])[0]?.country ?? null) as string | null;
  }
  lines.push(helpAnswer(country));

  const { data: kept } = await sb
    .from("awareness_places")
    .select("label, address, notes")
    .eq("user_id", scope.userId)
    .eq("category", "care")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(8);

  const rows = (kept ?? []) as Array<{ label: string; address: string | null; notes: string | null }>;
  if (rows.length) {
    lines.push("Care you kept:");
    for (const r of rows) {
      lines.push(`• ${r.label}${r.address ? ` — ${r.address}` : ""}${r.notes ? ` (${r.notes})` : ""}`);
    }
  } else {
    lines.push(
      "No hospital, clinic or pharmacy has been kept yet. Schedule → Help searches the map where you are standing and keeps the ones you pick.",
    );
  }
  lines.push(CARE_LAW);
  return lines.join("\n");
}
