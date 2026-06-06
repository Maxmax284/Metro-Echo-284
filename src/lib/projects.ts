// Data layer for the project-first Living Brief.
// Scope-aware: respects useActiveScope() (personal -> organization_id IS NULL,
// workspace -> organization_id = active org).

import { supabase } from "@/integrations/supabase/client";

export type ProjectStatus = "active" | "paused" | "archived";
export type ProjectItemType =
  | "capture"
  | "note"
  | "file"
  | "finding"
  | "commitment"
  | "action";

export interface Project {
  id: string;
  user_id: string;
  organization_id: string | null;
  title: string;
  summary: string;
  status: ProjectStatus;
  pinned: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ProjectItem {
  id: string;
  project_id: string;
  item_type: ProjectItemType;
  item_id: string;
  added_by: string;
  position: number;
  note: string | null;
  added_at: string;
}

interface ScopeFilter {
  userId: string;
  organizationId: string | null;
}

function applyScope<T extends { eq: any; is: any }>(query: T, scope: ScopeFilter): T {
  if (scope.organizationId) {
    return (query as any).eq("organization_id", scope.organizationId);
  }
  return (query as any).is("organization_id", null).eq("user_id", scope.userId);
}

export async function listProjects(scope: ScopeFilter): Promise<Project[]> {
  const base = supabase
    .from("projects")
    .select("*")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  const { data, error } = await applyScope(base as any, scope);
  if (error) throw error;
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as Project | null;
}

export async function createProject(input: {
  title: string;
  summary?: string;
  scope: ScopeFilter;
}): Promise<Project> {
  const row = {
    title: input.title.trim(),
    summary: input.summary ?? "",
    user_id: input.scope.userId,
    organization_id: input.scope.organizationId,
  };
  const { data, error } = await supabase
    .from("projects")
    .insert(row)
    .select("*")
    .single();
  if (error) throw error;
  return data as Project;
}

export async function updateProject(
  id: string,
  patch: Partial<Pick<Project, "title" | "summary" | "status" | "pinned">>
): Promise<Project> {
  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Project;
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw error;
}

export async function listProjectItems(projectId: string): Promise<ProjectItem[]> {
  const { data, error } = await supabase
    .from("project_items")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("added_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProjectItem[];
}

export async function attachToProject(input: {
  projectId: string;
  userId: string;
  items: { type: ProjectItemType; id: string; note?: string }[];
}): Promise<void> {
  if (input.items.length === 0) return;
  const rows = input.items.map((it, idx) => ({
    project_id: input.projectId,
    item_type: it.type,
    item_id: it.id,
    added_by: input.userId,
    position: idx,
    note: it.note ?? null,
  }));
  // ignoreDuplicates: re-attaching the same item is a no-op (unique constraint).
  const { error } = await supabase
    .from("project_items")
    .upsert(rows, { onConflict: "project_id,item_type,item_id", ignoreDuplicates: true });
  if (error) throw error;
}

export async function detachFromProject(itemRowId: string): Promise<void> {
  const { error } = await supabase.from("project_items").delete().eq("id", itemRowId);
  if (error) throw error;
}

// Resolve attached items into their full rows, grouped by type. Pure
// data-fetching — formatting and ordering happens in the page.
export interface ResolvedItems {
  captures: Array<{ id: string; created_at: string; transcript?: string | null; source?: string | null }>;
  notes: Array<{ id: string; title: string | null; body: string; updated_at: string }>;
  files: Array<{ id: string; filename: string; created_at: string; mime_type?: string | null; extracted_text?: string | null }>;
  findings: Array<{ id: string; title: string | null; summary: string | null; created_at: string; status: string }>;
  commitments: Array<{ id: string; summary: string; status: string; due_at: string | null; updated_at: string }>;
  actions: Array<{ id: string; title: string; status: string; risk: string | null; updated_at: string }>;
}

const empty: ResolvedItems = {
  captures: [], notes: [], files: [], findings: [], commitments: [], actions: [],
};

export async function resolveProjectItems(items: ProjectItem[]): Promise<ResolvedItems> {
  if (items.length === 0) return empty;
  const byType: Record<ProjectItemType, string[]> = {
    capture: [], note: [], file: [], finding: [], commitment: [], action: [],
  };
  for (const it of items) byType[it.item_type].push(it.item_id);

  const out: ResolvedItems = { captures: [], notes: [], files: [], findings: [], commitments: [], actions: [] };

  const fetches: Promise<unknown>[] = [];

  if (byType.note.length) {
    fetches.push(
      supabase.from("notes")
        .select("id,title,body,updated_at")
        .in("id", byType.note)
        .then(({ data }) => { out.notes = (data ?? []) as ResolvedItems["notes"]; })
    );
  }
  if (byType.file.length) {
    fetches.push(
      supabase.from("ingested_files")
        .select("id,filename,created_at,mime_type,extracted_text")
        .in("id", byType.file)
        .then(({ data }) => { out.files = (data ?? []) as ResolvedItems["files"]; })
    );
  }
  if (byType.finding.length) {
    fetches.push(
      supabase.from("sherlock_findings")
        .select("id,title,summary,created_at,status")
        .in("id", byType.finding)
        .then(({ data }) => { out.findings = (data ?? []) as ResolvedItems["findings"]; })
    );
  }
  if (byType.commitment.length) {
    fetches.push(
      supabase.from("commitments")
        .select("id,summary,status,due_at,updated_at")
        .in("id", byType.commitment)
        .then(({ data }) => { out.commitments = (data ?? []) as ResolvedItems["commitments"]; })
    );
  }
  if (byType.action.length) {
    fetches.push(
      supabase.from("actions")
        .select("id,title,status,risk,updated_at")
        .in("id", byType.action)
        .then(({ data }) => { out.actions = (data ?? []) as ResolvedItems["actions"]; })
    );
  }
  // Captures: stored in messages table under 'capture' role. Best-effort.
  if (byType.capture.length) {
    fetches.push(
      supabase.from("messages")
        .select("id,created_at,content")
        .in("id", byType.capture)
        .then(({ data }) => {
          out.captures = (data ?? []).map((r: any) => ({
            id: r.id, created_at: r.created_at, transcript: r.content, source: null,
          }));
        })
    );
  }

  await Promise.all(fetches);
  return out;
}
