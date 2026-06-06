// crossLinks — client wrapper around the cross_links RPCs.
// Doctrine: every call writes audit (via the RPC). UI never reaches into the
// table directly; this lib is the only path.
import { supabase } from "@/integrations/supabase/client";

export type CrossKind = "note" | "capture" | "commitment" | "action" | "file" | "message" | "entity";
export type CrossRelation = "related" | "about" | "part_of" | "blocks" | "duplicate_of";
export type CrossConfidence = "low" | "medium" | "high";
export type CrossCreatedBy = "user" | "sherlock" | "migration" | "system";

export const RELATIONS: { id: CrossRelation; label: string; hint: string }[] = [
  { id: "related",      label: "Related",        hint: "Same orbit, no strong claim." },
  { id: "about",        label: "About",          hint: "This item is primarily about that one." },
  { id: "part_of",      label: "Part of",        hint: "This belongs inside that." },
  { id: "blocks",       label: "Blocks",         hint: "This is in the way of that." },
  { id: "duplicate_of", label: "Duplicate of",   hint: "Same thing, captured twice." },
];

export const KIND_LABEL: Record<CrossKind, string> = {
  note: "Note",
  capture: "Capture",
  commitment: "Commitment",
  action: "Action",
  file: "File",
  message: "Message",
  entity: "Entity",
};

export type CrossLinkRow = {
  id: string;
  direction: "in" | "out";
  other_kind: CrossKind;
  other_id: string;
  relation: CrossRelation;
  confidence: CrossConfidence;
  created_by: CrossCreatedBy;
  reason: string | null;
  created_at: string;
  // hydrated label, optional
  other_label?: string | null;
};

export async function createCrossLink(input: {
  source_kind: CrossKind;
  source_id: string;
  target_kind: CrossKind;
  target_id: string;
  relation?: CrossRelation;
  confidence?: CrossConfidence;
  created_by?: CrossCreatedBy;
  reason?: string | null;
}): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await (supabase as any).rpc("cross_links_create", {
    _source_kind: input.source_kind,
    _source_id: input.source_id,
    _target_kind: input.target_kind,
    _target_id: input.target_id,
    _relation: input.relation ?? "related",
    _confidence: input.confidence ?? "medium",
    _created_by: input.created_by ?? "user",
    _reason: input.reason ?? null,
  });
  if (error) return { id: null, error: error.message };
  return { id: data as string };
}

export async function removeCrossLink(id: string, reason?: string): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc("cross_links_remove", { _id: id, _reason: reason ?? null });
  if (error) return false;
  return Boolean(data);
}

export async function listCrossLinksForItem(kind: CrossKind, id: string): Promise<CrossLinkRow[]> {
  if (!id) return [];
  const { data, error } = await (supabase as any).rpc("cross_links_for_item", { _kind: kind, _id: id });
  if (error || !data) return [];
  const rows = data as CrossLinkRow[];
  // Hydrate labels in batches per kind so chips show something readable.
  const byKind = new Map<CrossKind, string[]>();
  for (const r of rows) {
    if (!byKind.has(r.other_kind)) byKind.set(r.other_kind, []);
    byKind.get(r.other_kind)!.push(r.other_id);
  }
  const labels = new Map<string, string>();
  await Promise.all(Array.from(byKind.entries()).map(async ([k, ids]) => {
    const uniq = Array.from(new Set(ids));
    const items = await fetchLabels(k, uniq);
    for (const it of items) labels.set(`${k}:${it.id}`, it.label);
  }));
  return rows.map((r) => ({ ...r, other_label: labels.get(`${r.other_kind}:${r.other_id}`) ?? null }));
}

type LabeledItem = { id: string; label: string; preview?: string | null };

const KIND_TABLE: Record<CrossKind, { table: string; label: string; preview?: string }> = {
  note:       { table: "notes",          label: "title",        preview: "body" },
  commitment: { table: "commitments",    label: "summary" },
  action:     { table: "actions",        label: "title",        preview: "description" },
  file:       { table: "ingested_files", label: "filename" },
  message:    { table: "messages",       label: "content" },
  capture:    { table: "messages",       label: "content" },
  entity:     { table: "entities",       label: "display_name", preview: "summary" },
};

async function fetchLabels(kind: CrossKind, ids: string[]): Promise<LabeledItem[]> {
  if (ids.length === 0) return [];
  const def = KIND_TABLE[kind];
  const sel = def.preview ? `id, ${def.label}, ${def.preview}` : `id, ${def.label}`;
  const { data } = await (supabase as any).from(def.table).select(sel).in("id", ids);
  return (data ?? []).map((r: any) => ({
    id: r.id as string,
    label: String(r[def.label] ?? "").slice(0, 80) || `(untitled ${kind})`,
    preview: def.preview ? (r[def.preview] ? String(r[def.preview]).slice(0, 140) : null) : null,
  }));
}

// Universal search across all supported kinds. Cheap ILIKE per table —
// good enough for v1 manual linking. Semantic suggestions live in the
// suggestion pipeline (entity-resolve / memory_search), not here.
export async function searchTargets(query: string, opts: { userId: string; limit?: number; excludeKind?: CrossKind; excludeId?: string } ): Promise<Array<LabeledItem & { kind: CrossKind }>> {
  const q = query.trim();
  if (!q) return [];
  const userId = opts.userId;
  const limit = opts.limit ?? 6;
  const ilike = `%${q.replace(/[%_]/g, "")}%`;
  const tasks: Array<Promise<Array<LabeledItem & { kind: CrossKind }>>> = [];

  const run = async (kind: CrossKind, table: string, labelCol: string, previewCol?: string, extraFilter?: { col: string; eq: any }) => {
    const sel = previewCol ? `id, ${labelCol}, ${previewCol}` : `id, ${labelCol}`;
    let qb: any = (supabase as any).from(table).select(sel).eq("user_id", userId).ilike(labelCol, ilike).limit(limit);
    if (extraFilter) qb = qb.eq(extraFilter.col, extraFilter.eq);
    const { data } = await qb;
    return (data ?? []).map((r: any) => ({
      kind, id: r.id as string,
      label: String(r[labelCol] ?? "").slice(0, 80) || `(untitled ${kind})`,
      preview: previewCol && r[previewCol] ? String(r[previewCol]).slice(0, 140) : null,
    }));
  };

  tasks.push(run("note", "notes", "title", "body"));
  tasks.push(run("note", "notes", "body"));
  tasks.push(run("commitment", "commitments", "summary"));
  tasks.push(run("action", "actions", "title", "description"));
  tasks.push(run("file", "ingested_files", "filename"));
  tasks.push(run("entity", "entities", "display_name", "summary"));
  tasks.push(run("message", "messages", "content"));

  const all = (await Promise.all(tasks)).flat();
  // Dedup by kind+id, drop self.
  const seen = new Set<string>();
  const out: Array<LabeledItem & { kind: CrossKind }> = [];
  for (const r of all) {
    const key = `${r.kind}:${r.id}`;
    if (seen.has(key)) continue;
    if (opts.excludeKind && opts.excludeId && r.kind === opts.excludeKind && r.id === opts.excludeId) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit * 2) break;
  }
  return out;
}

// Suggestion source: this item's existing entity_links (auto-extracted) →
// surface as "Probably about X". User accepts → becomes a cross_link with
// relation=about, created_by=user (because they confirmed it).
export type LinkSuggestion = {
  target_kind: CrossKind;
  target_id: string;
  target_label: string;
  relation: CrossRelation;
  confidence: CrossConfidence;
  why: string;
};

export async function suggestForItem(input: {
  source_kind: CrossKind;
  source_id: string;
  userId: string;
}): Promise<LinkSuggestion[]> {
  const out: LinkSuggestion[] = [];

  // 1. entity_links on this source (only when source supports them — note/commitment/message/file/etc.)
  const ENTITY_LINK_SOURCE: Record<CrossKind, string | null> = {
    note: "note", commitment: "commitment", message: "message", capture: "message",
    file: "ingested_file", action: "action", entity: null,
  };
  const elKind = ENTITY_LINK_SOURCE[input.source_kind];
  if (elKind) {
    const { data: links } = await (supabase as any)
      .from("entity_links")
      .select("entity_id, confidence, role, metadata")
      .eq("user_id", input.userId)
      .eq("source_kind", elKind)
      .eq("source_id", input.source_id)
      .limit(8);
    const entityIds = Array.from(new Set((links ?? []).map((l: any) => l.entity_id as string)));
    if (entityIds.length) {
      const { data: ents } = await (supabase as any)
        .from("entities")
        .select("id, display_name, kind")
        .in("id", entityIds);
      for (const l of (links ?? []) as any[]) {
        const e = (ents ?? []).find((x: any) => x.id === l.entity_id);
        if (!e) continue;
        const sim = (l.metadata as any)?.similarity as number | undefined;
        const confidence: CrossConfidence = (l.confidence as CrossConfidence) ?? "medium";
        const pct = typeof sim === "number" ? ` · ${Math.round(sim * 100)}%` : "";
        out.push({
          target_kind: "entity",
          target_id: e.id,
          target_label: e.display_name,
          relation: e.kind === "project" ? "part_of" : "about",
          confidence,
          why: `Already linked as ${l.role ?? "mention"}${pct}.`,
        });
      }
    }
  }

  // 2. Cached Sherlock RELATE findings for this exact item — if the user
  //    already ran Sherlock's "relate" chip, reuse those clusters instead
  //    of re-asking the model. Sherlock suggested; user approves here.
  try {
    const { data: cachedRows } = await (supabase as any)
      .from("sherlock_findings_cache")
      .select("findings, updated_at, entity_type")
      .eq("user_id", input.userId)
      .eq("entity_id", input.source_id)
      .like("entity_type", "relate:%")
      .order("updated_at", { ascending: false })
      .limit(3);
    for (const row of (cachedRows ?? []) as any[]) {
      const rel = (row?.findings?.related ?? []) as Array<{ kind?: string; id?: string; why?: string; confidence?: string }>;
      for (const r of rel) {
        if (!r?.id || !r?.kind) continue;
        const kind = r.kind as CrossKind;
        if (kind === input.source_kind && r.id === input.source_id) continue;
        out.push({
          target_kind: kind,
          target_id: r.id,
          target_label: `${KIND_LABEL[kind] ?? kind} ${r.id.slice(0, 6)}`,
          relation: "related",
          confidence: ((r.confidence as CrossConfidence) ?? "medium"),
          why: `Sherlock: ${r.why ?? "related"}`,
        });
      }
    }
  } catch { /* best-effort */ }

  // 3. Semantic similars via memory-search edge function (uses the same
  //    pipeline Sherlock relies on). This is the user's tap-to-open
  //    surface — no automatic linking. Sherlock suggests; user approves.
  try {
    const sourceText = await fetchSourceText(input.source_kind, input.source_id);
    if (sourceText && sourceText.length > 6) {
      const { data } = await supabase.functions.invoke("memory-search", {
        body: { query: sourceText.slice(0, 1200), match_count: 6, min_similarity: 0.68 },
      });
      const hits: any[] = (data as any)?.results ?? (data as any)?.hits ?? [];
      for (const h of hits) {
        if (!h?.id || !h?.kind) continue;
        const kind = h.kind as CrossKind;
        if (kind === input.source_kind && h.id === input.source_id) continue;
        const sim = typeof h.similarity === "number" ? h.similarity : 0;
        out.push({
          target_kind: kind,
          target_id: h.id,
          target_label: (h.title || h.snippet || `${kind} ${h.id.slice(0, 6)}`).slice(0, 80),
          relation: "related",
          confidence: sim >= 0.82 ? "high" : sim >= 0.72 ? "medium" : "low",
          why: `Looks similar · ${Math.round(sim * 100)}%`,
        });
      }
    }
  } catch { /* best-effort */ }

  // Hydrate readable labels for Sherlock suggestions whose label is still a
  // raw kind+id stub. Cheap, batched per kind, only when needed.
  try {
    const stubs = out.filter((s) => /^[A-Z][a-z]+ [0-9a-f]{6}$/.test(s.target_label));
    if (stubs.length) {
      const byKind = new Map<CrossKind, string[]>();
      for (const s of stubs) {
        if (!byKind.has(s.target_kind)) byKind.set(s.target_kind, []);
        byKind.get(s.target_kind)!.push(s.target_id);
      }
      const labels = new Map<string, string>();
      await Promise.all(Array.from(byKind.entries()).map(async ([k, ids]) => {
        const items = await fetchLabels(k, Array.from(new Set(ids)));
        for (const it of items) labels.set(`${k}:${it.id}`, it.label);
      }));
      for (const s of out) {
        const hit = labels.get(`${s.target_kind}:${s.target_id}`);
        if (hit) s.target_label = hit;
      }
    }
  } catch { /* best-effort */ }

  // Dedup by target.
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.target_kind}:${s.target_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

async function fetchSourceText(kind: CrossKind, id: string): Promise<string | null> {
  const def = KIND_TABLE[kind];
  const cols = def.preview ? `${def.label}, ${def.preview}` : def.label;
  const { data } = await (supabase as any).from(def.table).select(cols).eq("id", id).maybeSingle();
  if (!data) return null;
  const parts = [data[def.label], def.preview ? data[def.preview] : null].filter(Boolean);
  return parts.join("\n").trim() || null;
}
