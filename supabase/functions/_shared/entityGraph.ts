// entityGraph — shared write-path helper for Phase 3a object/relationship model.
//
// Every capture surface (notes, commitments, messages, field_notes, signals,
// research, files, reminders, actions) calls linkEntities() after insert so
// the graph fills in passively. No new write surfaces, no new UI required to
// start populating data.
//
// Extraction is intentionally rule-based at this stage:
//   - Title Case multi-word tokens   → topic/thing
//   - @handles                       → person
//   - #hashtags                      → topic
//   - Bare URLs (host)               → thing
// Model-assisted extraction comes later (Phase 3b watch loop), once we have
// real graph signal to evaluate it against.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type EntitySourceKind =
  | "note" | "commitment" | "message" | "signal" | "field_note"
  | "research_object" | "ingested_file" | "reminder" | "action" | "investigation";

export type EntityKind = "person" | "place" | "org" | "topic" | "thing" | "event";

export type Candidate = {
  display_name: string;
  kind: EntityKind;
  aliases?: string[];
  confidence?: "low" | "medium" | "high";
};

// ---------- Extraction ------------------------------------------------------

const STOP = new Set([
  "The","A","An","And","Or","But","For","Of","In","On","At","To","From",
  "With","Without","By","As","If","Then","So","Is","Are","Was","Were","Be",
  "Been","Being","Do","Does","Did","Have","Has","Had","Will","Would","Should",
  "Could","Can","May","Might","Must","I","You","He","She","It","We","They",
  "My","Your","His","Her","Its","Our","Their","This","That","These","Those",
  "Today","Tomorrow","Yesterday","Tonight","Morning","Evening","Afternoon",
  "Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday",
  "January","February","March","April","May","June","July","August","September",
  "October","November","December",
]);

const TITLE_CASE_PHRASE =
  /\b([A-Z][a-zA-Z0-9'’-]*(?:\s+[A-Z][a-zA-Z0-9'’-]*){0,3})\b/g;
const HANDLE = /(?:^|\s)@([a-zA-Z0-9_]{3,})/g;
const HASHTAG = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{1,})/g;
const URL_RE = /\bhttps?:\/\/([^\s/]+)(?:\/[^\s]*)?/gi;

export function extractCandidates(text: string, max = 12): Candidate[] {
  if (!text) return [];
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate) => {
    const k = `${c.kind}::${c.display_name.toLowerCase()}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(c);
  };

  for (const m of text.matchAll(HANDLE)) {
    push({ display_name: `@${m[1]}`, kind: "person", confidence: "medium" });
  }
  for (const m of text.matchAll(HASHTAG)) {
    push({ display_name: `#${m[1]}`.toLowerCase(), kind: "topic", confidence: "medium" });
  }
  for (const m of text.matchAll(URL_RE)) {
    push({ display_name: m[1].toLowerCase(), kind: "thing", confidence: "low" });
  }
  for (const m of text.matchAll(TITLE_CASE_PHRASE)) {
    const phrase = m[1].trim();
    const words = phrase.split(/\s+/);
    if (words.length === 1 && STOP.has(words[0])) continue;
    if (words.every((w) => STOP.has(w))) continue;
    if (phrase.length < 3) continue;
    push({ display_name: phrase, kind: words.length >= 2 ? "topic" : "topic", confidence: "low" });
  }

  return out.slice(0, max);
}

// ---------- Resolve + upsert ------------------------------------------------

async function resolveOrInsert(
  sb: SupabaseClient,
  userId: string,
  c: Candidate,
): Promise<string | null> {
  const name = c.display_name.trim();
  if (!name) return null;

  // 1. exact display_name (case-insensitive) within same kind
  const { data: hit } = await sb
    .from("entities")
    .select("id, aliases")
    .eq("user_id", userId)
    .eq("kind", c.kind)
    .ilike("display_name", name)
    .limit(1)
    .maybeSingle();
  if (hit?.id) {
    await sb.from("entities").update({ last_seen_at: new Date().toISOString() }).eq("id", hit.id);
    return hit.id;
  }

  // 2. alias match (array contains)
  const { data: aliasHit } = await sb
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", c.kind)
    .contains("aliases", [name.toLowerCase()])
    .limit(1)
    .maybeSingle();
  if (aliasHit?.id) {
    await sb.from("entities").update({ last_seen_at: new Date().toISOString() }).eq("id", aliasHit.id);
    return aliasHit.id;
  }

  // 3. insert
  const { data: ins, error } = await sb.from("entities").insert({
    user_id: userId,
    kind: c.kind,
    display_name: name,
    aliases: c.aliases ?? [name.toLowerCase()],
    confidence: c.confidence ?? "low",
  }).select("id").single();
  if (error) return null;
  return ins?.id ?? null;
}

// ---------- Public API ------------------------------------------------------

export type LinkEntitiesInput = {
  sb: SupabaseClient;
  userId: string;
  source_kind: EntitySourceKind;
  source_id: string;
  text: string;
  role?: "mentions" | "about" | "owner" | "location" | "participant" | "source";
  emitAudit?: boolean;
};

export async function linkEntities(input: LinkEntitiesInput): Promise<{ linked: number }> {
  const { sb, userId, source_kind, source_id, text, role = "mentions", emitAudit = true } = input;
  if (!userId || !source_id) return { linked: 0 };

  const candidates = extractCandidates(text);
  if (candidates.length === 0) return { linked: 0 };

  const ids: string[] = [];
  for (const c of candidates) {
    const id = await resolveOrInsert(sb, userId, c);
    if (id) ids.push(id);
  }
  if (ids.length === 0) return { linked: 0 };

  const rows = ids.map((entity_id) => ({
    user_id: userId,
    entity_id,
    source_kind,
    source_id,
    role,
    confidence: "low",
  }));
  await sb.from("entity_links").upsert(rows, {
    onConflict: "source_kind,source_id,entity_id,role",
    ignoreDuplicates: true,
  });

  if (emitAudit) {
    await sb.from("audit_log").insert({
      user_id: userId,
      entity_type: "entity_graph",
      event: "entity.linked",
      payload: { source_kind, source_id, entity_count: ids.length, role },
    });
  }

  return { linked: ids.length };
}
