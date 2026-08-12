// useScope — the only hook surfaces should use for scope-aware data access.
// Wraps the WorkspaceProvider scope in the ScopeContract helpers so a surface
// never hand-rolls organization_id logic.
import { useMemo } from "react";
import { useWorkspace } from "@/providers/WorkspaceProvider";
import {
  applyScope,
  matchesScope,
  scopeDestination,
  scopeFields,
  scopeKey,
  stripScope,
  toScope,
  withScope,
  type ScopeContract,
} from "@/lib/scope";

export function useScope() {
  const { scope: raw, activeMembership, loading } = useWorkspace();

  return useMemo(() => {
    const scope: ScopeContract = toScope(raw);
    return {
      scope,
      loading,
      key: scopeKey(scope),
      orgId: scope.organizationId,
      isPersonal: scope.type === "personal",
      isOrganization: scope.type === "organization",
      isAdmin: scope.type === "admin",
      destination: scopeDestination(scope, activeMembership?.name),
      /** Apply strict isolation right after `.select(...)`. */
      applyScope: <Q extends { eq: any; is: any }>(q: Q) => applyScope(q, scope),
      /** Fields for a scoped insert. */
      scopeFields: () => scopeFields(scope),
      /** Merge scope into an insert row. */
      withScope: <T extends Record<string, unknown>>(row: T) => withScope(row, scope),
      /** Strip ownership keys from an update patch. */
      stripScope,
      /** Realtime / optimistic guard. */
      matches: (row: { organization_id?: string | null } | null | undefined) => matchesScope(row, scope),
    };
  }, [raw, activeMembership?.name, loading]);
}

export type ScopeApi = ReturnType<typeof useScope>;
