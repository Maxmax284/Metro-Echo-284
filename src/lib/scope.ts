// Scope contract — the single source of truth for "which room am I standing in".
//
// Vanta has exactly three rooms:
//   personal      -> organization_id IS NULL  (and user_id = me)
//   organization  -> organization_id = <org>
//   admin         -> platform-wide, no organization filter (owner only)
//
// Every scoped read, insert, update guard, delete guard, realtime handler and
// AI context builder derives from this module. Do not invent a second scope
// state anywhere else.

import type { ActiveScope } from "@/providers/WorkspaceProvider";

export type ScopeContract =
  | { type: "personal"; organizationId: null }
  | { type: "organization"; organizationId: string }
  | { type: "admin"; organizationId: null };

/** Normalise the provider's ActiveScope into the contract used by data helpers. */
export function toScope(scope: ActiveScope): ScopeContract {
  if (scope.kind === "workspace") {
    return { type: "organization", organizationId: scope.organization_id };
  }
  if (scope.kind === "admin") return { type: "admin", organizationId: null };
  return { type: "personal", organizationId: null };
}

/**
 * Tables that carry organization_id and MUST be scope-filtered.
 * Kept as a plain list so the audit doc and tests can assert against it.
 */
export const SCOPED_TABLES = [
  "actions",
  "audit_annotations",
  "audit_log",
  "brief_exports",
  "capture_routes",
  "commitments",
  "corrections",
  "documents",
  "field_notes",
  "ingested_files",
  "messages",
  "notes",
  "nudges",
  "privacy_settings",
  "projects",
  "sherlock_findings",
  "sherlock_findings_cache",
  "user_channel_links",
] as const;

/**
 * Intentionally global / non-scoped tables. These are per-user or platform level
 * and have no organization_id column — do not add one.
 */
export const GLOBAL_TABLES = [
  "profiles",
  "user_roles",
  "user_modes",
  "system_controls",
  "usage_limits",
  "api_cache",
  "api_usage_logs",
  "rate_limit_buckets",
  "push_subscriptions",
  "telegram_chat_links",
  "telegram_link_codes",
  "email_inbound_addresses",
  "action_executors",
  "action_events",
  "action_retries",
  "entities",
  "entity_links",
  "entity_relations",
  "cross_links",
  "conversations",
  "note_links",
  "sherlock_settings",
  "research_objects",
  "research_sources",
  "investigations",
  "investigation_findings",
  "document_reviews",
  "document_versions",
  "document_risks",
  "document_obligations",
  "awareness_places",
  "awareness_briefings",
  "awareness_snapshots",
  "operational_state_events",
  "intake_dismissals",
  "project_items",
  "project_suggestion_dismissals",
  "organizations",
  "organization_members",
  "integration_webhook_secrets",
  "external_platform_webhook_events",
  "external_platform_webhook_diagnostics",
] as const;

export function isScopedTable(table: string): boolean {
  return (SCOPED_TABLES as readonly string[]).includes(table);
}

type Filterable = {
  eq: (col: string, val: unknown) => unknown;
  is: (col: string, val: unknown) => unknown;
};

/**
 * Apply strict scope isolation to a select query. Call this immediately after
 * `.select(...)` and before `.order(...)` / `.limit(...)`.
 *
 * Strict by design: personal never sees org rows, org never sees personal rows.
 */
export function applyScope<Q extends Filterable>(query: Q, scope: ScopeContract): Q {
  if (scope.type === "organization") {
    return (query as any).eq("organization_id", scope.organizationId) as Q;
  }
  if (scope.type === "admin") return query;
  return (query as any).is("organization_id", null) as Q;
}

/**
 * Fields every scoped insert must carry so a record is born in the room the
 * user is standing in. Never spread this into an update.
 */
export function scopeFields(scope: ScopeContract): { organization_id: string | null } {
  return { organization_id: scope.type === "organization" ? scope.organizationId : null };
}

/** Merge scope into an insert payload (insert only — see stripScope for updates). */
export function withScope<T extends Record<string, unknown>>(
  row: T,
  scope: ScopeContract,
): T & { organization_id: string | null } {
  return { ...row, ...scopeFields(scope) };
}

/**
 * Remove ownership/scope keys from an update payload so ordinary edits can
 * never move a record between rooms via payload spreading.
 */
export function stripScope<T extends Record<string, unknown>>(patch: T): Omit<T, "organization_id" | "user_id"> {
  const clone: Record<string, unknown> = { ...patch };
  delete clone.organization_id;
  delete clone.user_id;
  return clone as Omit<T, "organization_id" | "user_id">;
}

/** Cache/effect key segment. Any keyed cache must include this. */
export function scopeKey(scope: ScopeContract): string {
  return scope.type === "organization" ? `org:${scope.organizationId}` : scope.type;
}

/**
 * Realtime + client-side guard: does this row belong to the active room?
 * postgres_changes filters cannot express "IS NULL", so personal scope is
 * enforced in the handler with this predicate.
 */
export function matchesScope(row: { organization_id?: string | null } | null | undefined, scope: ScopeContract): boolean {
  if (!row) return false;
  if (scope.type === "admin") return true;
  const org = row.organization_id ?? null;
  return scope.type === "organization" ? org === scope.organizationId : org === null;
}

/** Human destination hint for creation surfaces ("saving to …"). */
export function scopeDestination(scope: ScopeContract, orgName?: string | null): string {
  if (scope.type === "organization") return orgName || "this workspace";
  if (scope.type === "admin") return "Admin";
  return "Personal";
}
