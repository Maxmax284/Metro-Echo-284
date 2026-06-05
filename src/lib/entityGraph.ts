// entityGraph (client) — write-path helper mirroring
// supabase/functions/_shared/entityGraph.ts. Use after inserting a note,
// commitment, message, field_note, etc. so the entity graph fills in
// passively. Best-effort; never throws into the caller.
import { supabase } from "@/integrations/supabase/client";

export type EntitySourceKind =
  | "note" | "commitment" | "message" | "signal" | "field_note"
  | "research_object" | "ingested_file" | "reminder" | "action" | "investigation";

export type EntityKind = "person" | "place" | "org" | "topic" | "thing" | "event" | "project";

type Candidate = {
  display_name: string;
  kind: EntityKind;
  aliases?: string[];
  confidence?: "low" | "medium" | "high";
};

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
  "Hi","Hello","Hey","Thanks","Thank","Please","Re","Fwd","Ok","Okay","Yes","No",
  "Meeting","Call","Email","Note","Notes","Reminder","Task","Idea","Update",
  "Plan","Plans","Project","Status","Summary","Question","Answer","Action",
  "Quick","New","Need","Want","Going","Got","Made","Make","Get","See","Send",
]);

const TITLE_CASE_PHRASE = /\b([A-Z][a-zA-Z0-9'’-]+(?:\s+[A-Z][a-zA-Z0-9'’-]+){1,3})\b/g;
const HANDLE = /(?:^|\s)@([a-zA-Z0-9_]{3,})/g;
const HASHTAG = /(?:^|\s)#([a-zA-Z][a-zA-Z0-9_-]{1,})/g;
const URL_RE = /\bhttps?:\/\/([^\s/]+)(?:\/[^\s]*)?/gi;
const COMMON_HOSTS = new Set([
  "www.google.com","google.com","docs.google.com","drive.google.com",
  "youtube.com","youtu.be","twitter.com","x.com","github.com","gist.github.com",
  "apple.com","icloud.com","amazon.com","wikipedia.org","en.wikipedia.org",
]);

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
  for (const m of text.matchAll(HANDLE)) push({ display_name: `@${m[1]}`, kind: "person", confidence: "medium" });
  for (const m of text.matchAll(HASHTAG)) push({ display_name: `#${m[1]}`.toLowerCase(), kind: "topic", confidence: "medium" });
  for (const m of text.matchAll(URL_RE)) {
    const host = m[1].toLowerCase();
    if (COMMON_HOSTS.has(host)) continue;
    push({ display_name: host, kind: "thing", confidence: "low" });
  }
  for (const m of text.matchAll(TITLE_CASE_PHRASE)) {
    const phrase = m[1].trim();
    const words = phrase.split(/\s+/);
    if (words.length < 2) continue;
    const stopCount = words.filter((w) => STOP.has(w)).length;
    if (stopCount * 2 >= words.length) continue;
    if (phrase.length < 4) continue;
    const confidence: Candidate["confidence"] = words.length >= 3 ? "medium" : "low";
    push({ display_name: phrase, kind: "topic", confidence });
  }
  return out.slice(0, max);
}

async function resolveOrInsert(userId: string, c: Candidate): Promise<string | null> {
  const name = c.display_name.trim();
  if (!name) return null;

  const { data: hit } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", c.kind)
    .ilike("display_name", name)
    .limit(1)
    .maybeSingle();
  if (hit?.id) {
    await supabase.from("entities").update({ last_seen_at: new Date().toISOString() }).eq("id", hit.id);
    return hit.id;
  }

  const { data: aliasHit } = await supabase
    .from("entities")
    .select("id")
    .eq("user_id", userId)
    .eq("kind", c.kind)
    .contains("aliases", [name.toLowerCase()])
    .limit(1)
    .maybeSingle();
  if (aliasHit?.id) {
    await supabase.from("entities").update({ last_seen_at: new Date().toISOString() }).eq("id", aliasHit.id);
    return aliasHit.id;
  }

  const { data: ins, error } = await supabase.from("entities").insert({
    user_id: userId,
    kind: c.kind,
    display_name: name,
    aliases: c.aliases ?? [name.toLowerCase()],
    confidence: c.confidence ?? "low",
  }).select("id").single();
  if (error) return null;
  return ins?.id ?? null;
}

// Token shapes used by the "known entity recall" pass — catches single-word
// brands (Vanta, Fenrir, CampCore), ALL-CAPS acronyms (GTH, AWS, CC), and
// any multi-word title-case phrase the existing regex might skip. Whether
// each token actually links is decided by matching against the user's
// existing entity index — we never invent new entities from this pass.
const SINGLE_TITLE = /\b([A-Z][a-zA-Z0-9'’-]{2,})\b/g;
const ACRONYM = /\b([A-Z]{2,6})\b/g;

function buildTokenSet(text: string): Set<string> {
  const out = new Set<string>();
  if (!text) return out;
  for (const m of text.matchAll(SINGLE_TITLE)) {
    const w = m[1];
    if (STOP.has(w)) continue;
    out.add(w.toLowerCase());
  }
  for (const m of text.matchAll(ACRONYM)) out.add(m[1].toLowerCase());
  for (const m of text.matchAll(TITLE_CASE_PHRASE)) out.add(m[1].toLowerCase());
  return out;
}

type KnownEntity = { id: string; display_name: string; aliases: string[] | null; kind: string };

async function recallKnownEntities(
  userId: string,
  text: string,
): Promise<{ id: string; confidence: "high" }[]> {
  const tokens = buildTokenSet(text);
  if (tokens.size === 0) return [];
  // Pull the user's recent entities once; in-memory match is far cheaper
  // than N round-trips. 500 covers active users; older entities still
  // resolve via resolveOrInsert when they reappear as full title-case.
  const { data } = await supabase
    .from("entities")
    .select("id, display_name, aliases, kind")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: false })
    .limit(500);
  if (!data || data.length === 0) return [];
  const hits: { id: string; confidence: "high" }[] = [];
  const seen = new Set<string>();
  for (const e of data as KnownEntity[]) {
    const name = (e.display_name ?? "").toLowerCase();
    const aliases = (e.aliases ?? []).map((a) => (a ?? "").toLowerCase());
    const candidates = [name, ...aliases].filter(Boolean);
    if (candidates.some((c) => tokens.has(c))) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      hits.push({ id: e.id, confidence: "high" });
    }
  }
  if (hits.length > 0) {
    const ids = hits.map((h) => h.id);
    await supabase
      .from("entities")
      .update({ last_seen_at: new Date().toISOString() })
      .in("id", ids);
  }
  return hits;
}

export type LinkEntitiesInput = {
  userId: string;
  source_kind: EntitySourceKind;
  source_id: string;
  text: string;
  role?: "mentions" | "about" | "owner" | "location" | "participant" | "source";
  emitAudit?: boolean;
};

export async function linkEntities(input: LinkEntitiesInput): Promise<{ linked: number }> {
  try {
    const { userId, source_kind, source_id, text, role = "mentions", emitAudit = true } = input;
    if (!userId || !source_id) return { linked: 0 };

    // Pass 1 — known-entity recall (catches single-token brands + aliases).
    const recalled = await recallKnownEntities(userId, text);
    const linked: { id: string; confidence: Candidate["confidence"] }[] = [...recalled];
    const linkedIds = new Set(recalled.map((r) => r.id));

    // Pass 2 — rule-based extraction → resolve or insert new entities.
    const candidates = extractCandidates(text);
    for (const c of candidates) {
      const id = await resolveOrInsert(userId, c);
      if (!id || linkedIds.has(id)) continue;
      linkedIds.add(id);
      linked.push({ id, confidence: c.confidence ?? "low" });
    }
    if (linked.length === 0) return { linked: 0 };

    const rows = linked.map(({ id, confidence }) => ({
      user_id: userId,
      entity_id: id,
      source_kind,
      source_id,
      role,
      confidence: (confidence ?? "low") as "low" | "medium" | "high",
    }));
    await supabase.from("entity_links").upsert(rows, {
      onConflict: "source_kind,source_id,entity_id,role",
      ignoreDuplicates: true,
    });

    if (emitAudit) {
      await supabase.from("audit_log").insert({
        user_id: userId,
        entity_type: "entity_graph",
        event: "entity.linked",
        payload: { source_kind, source_id, entity_count: linked.length, role, recalled: recalled.length },
      });
    }
    return { linked: linked.length };
  } catch {
    return { linked: 0 };
  }
}

