// Lightweight project suggestion engine.
// No AI, no embeddings — just title/keyword match against recent items in
// the project's scope (workspace -> workspace items only; personal -> personal
// items only). Excludes already-attached and previously-dismissed items.

import { supabase } from "@/integrations/supabase/client";
import type { Project, ProjectItem, ProjectItemType } from "@/lib/projects";

export interface SuggestedItem {
  type: Exclude<ProjectItemType, "finding">;
  id: string;
  label: string;
  snippet?: string;
  created_at: string;
  score: number;
}

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","for","in","on","at","by","with",
  "is","are","be","this","that","it","as","from","into","my","our","your",
  "project","brief","note","notes","update","updates",
]);

export function tokenize(text: string): string[] {
  return Array.from(new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
  )).slice(0, 8);
}

interface FetchArgs {
  project: Project;
  attached: ProjectItem[];
  lookbackDays?: number;
  perTypeLimit?: number;
}

function scopeFilter(q: any, project: Project) {
  if (project.organization_id) return q.eq("organization_id", project.organization_id);
  return q.is("organization_id", null).eq("user_id", project.user_id);
}

// Build OR clause for ILIKE across given columns using a few tokens.
function orClauseFor(tokens: string[], cols: string[]): string | null {
  if (!tokens.length || !cols.length) return null;
  const parts: string[] = [];
  for (const tok of tokens) {
    const esc = tok.replace(/[,()*%]/g, "");
    if (!esc) continue;
    for (const col of cols) parts.push(`${col}.ilike.%${esc}%`);
  }
  return parts.join(",") || null;
}

export async function loadProjectSuggestions(args: FetchArgs): Promise<SuggestedItem[]> {
  const { project, attached } = args;
  const lookbackDays = args.lookbackDays ?? 60;
  const perType = args.perTypeLimit ?? 8;
  const sinceIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString();

  const tokens = tokenize(`${project.title} ${project.summary ?? ""}`);

  // Dismissed
  const { data: dismissedRows } = await supabase
    .from("project_suggestion_dismissals")
    .select("item_type,item_id")
    .eq("project_id", project.id);
  const dismissed = new Set((dismissedRows ?? []).map((r: any) => `${r.item_type}:${r.item_id}`));

  // Attached
  const attachedSet = new Set(attached.map((a) => `${a.item_type}:${a.item_id}`));

  const exclude = (type: SuggestedItem["type"], id: string) =>
    dismissed.has(`${type}:${id}`) || attachedSet.has(`${type}:${id}`);

  const scoreFor = (label: string, snippet?: string) => {
    if (!tokens.length) return 1; // pure recency signal
    const hay = (label + " " + (snippet ?? "")).toLowerCase();
    let s = 0;
    for (const t of tokens) if (hay.includes(t)) s += 1;
    return s;
  };

  async function fetchNotes(): Promise<SuggestedItem[]> {
    let q = supabase
      .from("notes")
      .select("id,title,body,updated_at,created_at")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(perType * 3);
    q = scopeFilter(q, project);
    const or = orClauseFor(tokens, ["title", "body"]);
    if (or) q = q.or(or);
    const { data } = await q;
    return (data ?? [])
      .filter((r: any) => !exclude("note", r.id))
      .map((r: any) => ({
        type: "note" as const,
        id: r.id,
        label: r.title?.trim() || (r.body ? r.body.slice(0, 60) : "Untitled note"),
        snippet: r.body?.slice(0, 140),
        created_at: r.updated_at ?? r.created_at,
        score: scoreFor(r.title ?? "", r.body),
      }));
  }

  async function fetchMessages(): Promise<SuggestedItem[]> {
    let q = supabase
      .from("messages")
      .select("id,content,created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(perType * 3);
    q = scopeFilter(q, project);
    const or = orClauseFor(tokens, ["content"]);
    if (or) q = q.or(or);
    const { data } = await q;
    return (data ?? [])
      .filter((r: any) => !exclude("capture", r.id))
      .map((r: any) => ({
        type: "capture" as const,
        id: r.id,
        label: (r.content ?? "Capture").slice(0, 80),
        snippet: r.content?.slice(0, 140),
        created_at: r.created_at,
        score: scoreFor(r.content ?? ""),
      }));
  }

  async function fetchFiles(): Promise<SuggestedItem[]> {
    let q = supabase
      .from("ingested_files")
      .select("id,filename,created_at,extracted_text")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(perType * 3);
    q = scopeFilter(q, project);
    const or = orClauseFor(tokens, ["filename", "extracted_text"]);
    if (or) q = q.or(or);
    const { data } = await q;
    return (data ?? [])
      .filter((r: any) => !exclude("file", r.id))
      .map((r: any) => ({
        type: "file" as const,
        id: r.id,
        label: r.filename ?? "File",
        snippet: r.extracted_text?.slice(0, 140),
        created_at: r.created_at,
        score: scoreFor(r.filename ?? "", r.extracted_text),
      }));
  }

  async function fetchCommitments(): Promise<SuggestedItem[]> {
    let q = supabase
      .from("commitments")
      .select("id,summary,updated_at,status")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(perType * 3);
    q = scopeFilter(q, project);
    const or = orClauseFor(tokens, ["summary"]);
    if (or) q = q.or(or);
    const { data } = await q;
    return (data ?? [])
      .filter((r: any) => !exclude("commitment", r.id))
      .map((r: any) => ({
        type: "commitment" as const,
        id: r.id,
        label: r.summary ?? "Commitment",
        created_at: r.updated_at,
        score: scoreFor(r.summary ?? ""),
      }));
  }

  async function fetchActions(): Promise<SuggestedItem[]> {
    let q = supabase
      .from("actions")
      .select("id,title,updated_at,status")
      .gte("updated_at", sinceIso)
      .order("updated_at", { ascending: false })
      .limit(perType * 3);
    q = scopeFilter(q, project);
    const or = orClauseFor(tokens, ["title"]);
    if (or) q = q.or(or);
    const { data } = await q;
    return (data ?? [])
      .filter((r: any) => !exclude("action", r.id))
      .map((r: any) => ({
        type: "action" as const,
        id: r.id,
        label: r.title ?? "Action",
        created_at: r.updated_at,
        score: scoreFor(r.title ?? ""),
      }));
  }

  const groups = await Promise.all([
    fetchNotes(), fetchMessages(), fetchFiles(), fetchCommitments(), fetchActions(),
  ]);

  const merged = groups.flat();
  // Rank: token match score first, then recency. Drop zero-score items when
  // we actually have tokens to match against (avoids pulling random recent stuff).
  const ranked = merged
    .filter((it) => (tokens.length === 0 ? true : it.score > 0))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return +new Date(b.created_at) - +new Date(a.created_at);
    })
    .slice(0, 12);

  return ranked;
}

export async function dismissSuggestion(input: {
  projectId: string;
  userId: string;
  type: SuggestedItem["type"];
  id: string;
}): Promise<void> {
  const { error } = await supabase
    .from("project_suggestion_dismissals")
    .upsert(
      {
        project_id: input.projectId,
        user_id: input.userId,
        item_type: input.type,
        item_id: input.id,
      },
      { onConflict: "project_id,item_type,item_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function listDismissed(projectId: string): Promise<
  Array<{ id: string; item_type: string; item_id: string; dismissed_at: string }>
> {
  const { data, error } = await supabase
    .from("project_suggestion_dismissals")
    .select("id,item_type,item_id,dismissed_at")
    .eq("project_id", projectId)
    .order("dismissed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function restoreDismissed(rowId: string): Promise<void> {
  const { error } = await supabase
    .from("project_suggestion_dismissals")
    .delete()
    .eq("id", rowId);
  if (error) throw error;
}
