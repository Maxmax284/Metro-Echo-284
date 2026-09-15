// noteReads — reading what was captured.
//
// Notes are evidence, so a read of them is read-only by construction: nothing in
// this module writes, edits, stages or executes. It answers two questions Echo is
// asked constantly in Ask and on Telegram:
//
//   "find the note where we discussed X"
//   "what did we decide?" / "pull out the follow-ups"
//
// Anything it reports comes off a stored row. When a capture has interpretation
// layers, the layers are quoted; when it does not, the note's own words are.

type SupabaseClient = { from: (table: string) => any };

import {
  layersFromMetadata,
  matteredCount,
  type WhatMattered,
} from "./captureLayers.ts";

export type NoteScope = { userId: string; orgId: string | null };

export type NoteHit = {
  id: string;
  title: string;
  when: string;
  snippet: string;
  mattered: WhatMattered | null;
};

function scoped(sb: SupabaseClient, scope: NoteScope) {
  let q = sb.from("notes").select("id, title, body, metadata, created_at, updated_at").eq("user_id", scope.userId);
  q = scope.orgId ? q.eq("organization_id", scope.orgId) : q.is("organization_id", null);
  return q;
}

function niceDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "an unrecorded date";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function toHit(row: Record<string, unknown>): NoteHit {
  const layers = layersFromMetadata(row.metadata);
  const body = String(row.body ?? "");
  const clean = layers?.clean?.text ?? body;
  return {
    id: String(row.id),
    title: String(row.title ?? "").trim() || "Untitled note",
    when: niceDate(String(row.created_at ?? row.updated_at ?? "")),
    snippet: clean.replace(/\s+/g, " ").slice(0, 180),
    mattered: layers?.mattered ?? null,
  };
}

/** Keyword search across a person's own notes. Their words only. */
export async function findNotes(
  sb: SupabaseClient,
  scope: NoteScope,
  query: string,
  limit = 5,
): Promise<NoteHit[]> {
  const q = query.trim();
  if (!q) return [];
  const like = `%${q.replace(/[%_]/g, " ")}%`;
  const { data } = await scoped(sb, scope)
    .or(`title.ilike.${like},body.ilike.${like}`)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(toHit);
}

/** The most recent captures, for "what did we decide?" with no subject given. */
export async function recentNotes(
  sb: SupabaseClient,
  scope: NoteScope,
  limit = 5,
): Promise<NoteHit[]> {
  const { data } = await scoped(sb, scope).order("created_at", { ascending: false }).limit(limit);
  return ((data ?? []) as Record<string, unknown>[]).map(toHit);
}

/** Plain English for a set of hits. Empty is a real answer, said plainly. */
export function formatNoteHits(hits: NoteHit[], query?: string): string {
  if (!hits.length) {
    return query
      ? `No note mentions “${query}”.`
      : "There are no captured notes on this desk yet.";
  }
  return hits
    .map((h) => {
      const bits = [`“${h.title}” (${h.when}): ${h.snippet}`];
      if (h.mattered && matteredCount(h.mattered)) bits.push(matteredLine(h.mattered));
      return `- ${bits.join(" ")}`;
    })
    .join("\n");
}

/** What a capture recorded as mattering, quoted rather than re-decided. */
export function matteredLine(m: WhatMattered): string {
  const parts: string[] = [];
  if (m.decisions.length) parts.push(`decided: ${m.decisions.join("; ")}`);
  const follow = [...m.commitments, ...m.followUps];
  if (follow.length) parts.push(`follow-ups: ${follow.join("; ")}`);
  if (m.questions.length) parts.push(`open: ${m.questions.join("; ")}`);
  if (!parts.length && m.possibleActions.length) parts.push(`possible next steps: ${m.possibleActions.join("; ")}`);
  return parts.length ? `[recorded — ${parts.join(" | ")}]` : "";
}

/**
 * "What did we decide?" / "pull out the follow-ups" over recent captures.
 * Only recorded layers are reported — this never re-interprets a transcript.
 */
export async function whatWasDecided(
  sb: SupabaseClient,
  scope: NoteScope,
  opts?: { query?: string; want?: "decisions" | "followUps" | "all" },
): Promise<string> {
  const want = opts?.want ?? "all";
  const hits = opts?.query ? await findNotes(sb, scope, opts.query, 6) : await recentNotes(sb, scope, 6);
  if (!hits.length) {
    return opts?.query ? `No note mentions “${opts.query}”.` : "There are no captured notes on this desk yet.";
  }
  const lines: string[] = [];
  for (const h of hits) {
    const m = h.mattered;
    if (!m) continue;
    const picked =
      want === "decisions" ? m.decisions
        : want === "followUps" ? [...m.commitments, ...m.followUps]
          : [...m.decisions, ...m.commitments, ...m.followUps, ...m.questions];
    if (picked.length) lines.push(`- ${h.title} (${h.when}): ${picked.join("; ")}`);
  }
  if (!lines.length) {
    return "Those captures have no recorded decisions or follow-ups. Nothing was pulled out of them.";
  }
  return lines.join("\n");
}
