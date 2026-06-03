// WorkspaceProvider — active scope (personal / workspace / admin) + memberships.
// Persists the user's selection in localStorage so the cockpit reopens in the
// same lane they left it in. Workspace data and personal data never mix here:
// the active scope is the contract for every downstream query.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type WorkspaceRole = "owner_admin" | "manager" | "member" | "viewer";

export type Membership = {
  organization_id: string;
  name: string;
  slug: string;
  type: string;
  role: WorkspaceRole;
  status: string;
  owner_id: string;
};

export type ScopeKind = "personal" | "workspace" | "admin";

export type ActiveScope =
  | { kind: "personal" }
  | { kind: "workspace"; organization_id: string }
  | { kind: "admin" };

const STORAGE_KEY = "vanta.workspace.scope.v1";

type Ctx = {
  loading: boolean;
  memberships: Membership[];
  scope: ActiveScope;
  activeMembership: Membership | null;
  setScope: (s: ActiveScope) => void;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<Ctx | null>(null);

function loadStoredScope(): ActiveScope {
  if (typeof window === "undefined") return { kind: "personal" };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { kind: "personal" };
    const parsed = JSON.parse(raw) as ActiveScope;
    if (parsed?.kind === "workspace" && typeof parsed.organization_id === "string") return parsed;
    if (parsed?.kind === "admin") return parsed;
    return { kind: "personal" };
  } catch {
    return { kind: "personal" };
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [scope, setScopeState] = useState<ActiveScope>(loadStoredScope);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setMemberships([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("organization_members")
      .select("organization_id, role, status, organizations!inner(id, name, slug, type, owner_id)")
      .eq("user_id", session.user.id)
      .eq("status", "active");
    const rows: Membership[] = (data ?? []).map((r: any) => ({
      organization_id: r.organization_id,
      role: (r.role ?? "member") as WorkspaceRole,
      status: r.status,
      name: r.organizations?.name ?? "Workspace",
      slug: r.organizations?.slug ?? r.organization_id,
      type: r.organizations?.type ?? "business",
      owner_id: r.organizations?.owner_id ?? "",
    }));
    setMemberships(rows);
    setLoading(false);
  }, [session]);

  useEffect(() => { refresh(); }, [refresh]);

  // If the persisted scope points at a workspace the user no longer belongs to,
  // fall back to personal silently.
  useEffect(() => {
    if (loading) return;
    if (scope.kind === "workspace") {
      const stillMember = memberships.some((m) => m.organization_id === scope.organization_id);
      if (!stillMember) setScopeState({ kind: "personal" });
    }
  }, [loading, memberships, scope]);

  const setScope = useCallback((s: ActiveScope) => {
    setScopeState(s);
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
  }, []);

  const activeMembership = useMemo(() => {
    if (scope.kind !== "workspace") return null;
    return memberships.find((m) => m.organization_id === scope.organization_id) ?? null;
  }, [scope, memberships]);

  const value: Ctx = { loading, memberships, scope, activeMembership, setScope, refresh };
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): Ctx {
  const v = useContext(WorkspaceContext);
  if (!v) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return v;
}

export function useActiveScope(): ActiveScope {
  return useWorkspace().scope;
}

// Returns the organization_id to use as an RLS filter, or null when scope is
// personal/admin. Surfaces should use this directly: `.eq("organization_id", id)`
// when set, or `.is("organization_id", null)` when scope is personal.
export function useActiveOrgId(): string | null {
  const scope = useActiveScope();
  return scope.kind === "workspace" ? scope.organization_id : null;
}

export function scopeLabel(scope: ActiveScope, membership: Membership | null): string {
  if (scope.kind === "admin") return "Admin · all workspaces";
  if (scope.kind === "workspace" && membership) {
    const role = membership.role === "owner_admin" ? "Owner"
      : membership.role === "manager" ? "Manager"
      : membership.role === "viewer" ? "Viewer"
      : "Member";
    return `${membership.name} · ${role}`;
  }
  return "Personal";
}
