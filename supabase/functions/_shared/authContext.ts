// resolveScopeContext — one place that answers "who is asking, and from which room".
// The client scope contract (src/lib/scope.ts) has a server twin here so reads and
// writes agree. RLS remains the final enforcement layer; this only makes the
// correct behaviour the easy one.

export type ServerScope =
  | { type: "personal"; organizationId: null }
  | { type: "organization"; organizationId: string };

export type ScopeContext = {
  userId: string;
  scope: ServerScope;
};

type MinimalAuthClient = {
  auth: { getUser: (token?: string) => Promise<{ data: { user: { id: string } | null } | null }> };
  from: (table: string) => any;
};

export function bearerToken(req: Request): string {
  return (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
}

/** Resolve the caller. Returns null when there is no valid session. */
export async function resolveUser(
  req: Request,
  client: MinimalAuthClient,
): Promise<{ id: string } | null> {
  const { data } = await client.auth.getUser(bearerToken(req));
  const id = data?.user?.id;
  return id ? { id: id as string } : null;
}

/** Normalise a requested organization_id into the canonical scope shape. */
export function toServerScope(organizationId?: string | null): ServerScope {
  return organizationId
    ? { type: "organization", organizationId }
    : { type: "personal", organizationId: null };
}

/** Membership check for workspace scope. Personal scope always passes. */
export async function assertScopeAccess(
  client: MinimalAuthClient,
  userId: string,
  scope: ServerScope,
): Promise<boolean> {
  if (scope.type === "personal") return true;
  const { data } = await client
    .from("organization_members")
    .select("id")
    .eq("organization_id", scope.organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return Boolean(data);
}

/**
 * Resolve caller + validated scope in one step.
 * `requestedOrganizationId` comes from the request body (the client sends the
 * active room). An unauthorised membership resolves to personal, never to a
 * silent cross-workspace read.
 */
export async function resolveScopeContext(
  req: Request,
  client: MinimalAuthClient,
  requestedOrganizationId?: string | null,
): Promise<ScopeContext | null> {
  const user = await resolveUser(req, client);
  if (!user) return null;
  const scope = toServerScope(requestedOrganizationId);
  if (!(await assertScopeAccess(client, user.id, scope))) {
    return { userId: user.id, scope: { type: "personal", organizationId: null } };
  }
  return { userId: user.id, scope };
}

/** Apply scope to a select query on a scoped table. */
export function applyServerScope<Q extends { eq: (c: string, v: unknown) => Q; is: (c: string, v: unknown) => Q }>(
  query: Q,
  scope: ServerScope,
): Q {
  return scope.type === "organization"
    ? query.eq("organization_id", scope.organizationId)
    : query.is("organization_id", null);
}

/** Fields every scoped insert must carry. Never spread into an update. */
export function serverScopeFields(scope: ServerScope): { organization_id: string | null } {
  return { organization_id: scope.type === "organization" ? scope.organizationId : null };
}
