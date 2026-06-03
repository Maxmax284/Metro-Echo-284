
# Workspace, Roles & RLS Foundation Pass

Decisions you locked in:
- Foundation + admin member management (no email invite flow yet).
- Reuse existing `organizations` / `organization_members` tables, labeled "Workspace" in UI.
- Add `organization_id` to capture-side tables only: messages, capture_routes, ingested_files, notes, commitments, actions, audit_log.

Doctrine guardrails honored: capture never executes, RLS is the lock (not the UI), personal data stays personal, no autonomous actions, no new external integrations.

---

## 1. Audit summary (what's already there)

- `organizations` (id, owner_id, name, kind text default 'personal') and `organization_members` (role text default 'member') already exist. `handle_new_user` provisions a personal org and an 'owner' membership per signup.
- Global `user_roles` with `app_role` enum (admin/user/owner). `has_role()` + `is_org_member()` security-definer helpers exist. Keep both — global `app_role` stays the platform-superadmin signal; workspace role lives on `organization_members.role`.
- Almost every operational table is `user_id`-scoped only with `auth.uid() = user_id` RLS. Only `field_notes` and `corrections` already understand `organization_id`.
- App layer has **zero** workspace awareness today — `useRole` returns the global role, and no surface filters by org. `briefing-compose` already accepts `sources` filter (perfect hook for scope).
- Telegram pairing is implicit through `telegram-webhook` writing to `messages` with metadata; no `user_channel_links` table, no UI for routing default.

## 2. Schema changes

### a. Tighten `organizations` & memberships
- Add `organizations.type text` (values: `personal`, `business`, `property_ops`, `gym_ops`, `security_ops`, `admin_system`) defaulted from existing `kind`.
- Add `organizations.slug text unique`.
- Constrain `organization_members.role` to: `owner_admin`, `manager`, `member`, `viewer`. Default `member`. Migrate existing 'owner' → 'owner_admin', 'member' stays.
- Add `organization_members.status text` (`active`, `suspended`, `removed`) default `active`, plus `invited_by`, `accepted_at`, `removed_at`.
- New security-definer helper `org_role(_org_id uuid, _user_id uuid) returns text`.

### b. `user_channel_links` (new)
Per-user, per-channel pairing with default route. Fields: id, user_id, channel (`telegram`|`whatsapp`|`email`), provider_user_id, external_channel_id, status, default_route (`personal`|`ask_each_time`|`workspace:<uuid>`), linked_at, last_seen_at, metadata.
- RLS: user owns own row. `service_role` full.

### c. Add `organization_id uuid` (nullable) to:
`messages`, `capture_routes`, `ingested_files`, `notes`, `commitments`, `actions`, `audit_log`.
- No backfill — existing rows stay personal (`organization_id is null`).
- Index `(organization_id, created_at desc)` on each.

### d. RLS rewrite for the seven tables above
Pattern per table:
```text
personal access:   user_id = auth.uid() AND organization_id IS NULL
workspace access:  organization_id IS NOT NULL
                   AND is_org_member(organization_id, auth.uid())
                   AND (role allows the operation)
```
- Read for active members. Insert requires writer-tier role (`owner_admin`/`manager`/`member`). Update/delete: own row OR `owner_admin` on the org.
- `audit_log`: insert by anyone with access to the related scope; select read-only.

### e. Admin/system tables stay locked
`api_cache`, `api_usage_logs`, `system_controls`, `integration_webhook_secrets`, `external_platform_webhook_*` keep their owner/service-role-only policies. Not touched in this pass.

## 3. Backend (edge functions)

- `briefing-compose`: accept new `scope` param `{ kind: 'personal' | 'workspace' | 'admin', organization_id?: uuid }`. Resolve membership; filter `messages` + `capture_routes` by scope. Add scope to `hashSeed`. Refuse non-member calls. Show "Nothing important in your lane right now." when empty.
- `telegram-webhook`: on first message from a chat, upsert `user_channel_links` row. Apply `default_route` when creating `messages` / `capture_routes` — `personal` → `organization_id` null; `workspace:<id>` → set `organization_id` only if user is an active member; `ask_each_time` → leave null and surface a route prompt in the capture (deferred to next pass for the prompt UI).
- Other ingest functions (`gth-inbound`, `campcore-inbound`, `external-platform-inbound`, `website-forms-inbound`, `email-inbound`): accept `organization_id` from the configured integration owner. Out of scope to wire up per-integration ownership — leave a TODO and keep current owner-scoped behavior. No regressions.

## 4. Frontend

### a. Active scope context
- New `WorkspaceProvider` (React context + `useActiveScope()`): persists `{ kind, organization_id }` in localStorage. Default = `personal`. Reads memberships from `organization_members` join `organizations`.
- New `useRole(orgId?)` overload: returns `{ global: app_role, workspace: 'owner_admin'|'manager'|'member'|'viewer'|null, scopeLabel }`. Existing call sites keep working.

### b. Workspace switcher
- Small dropdown in the cockpit header. Items: Personal • each active workspace • Admin (only if global `admin` role). Hide entirely if user only has Personal — no empty UI.
- Shows current scope as a chip ("GroundStay · Manager").

### c. Scoped surfaces
- `OperationsBriefingPanel`: pass active scope to `briefing-compose`. Update scope badge to use workspace role label.
- `ReconciliationView`: scope its queries to active workspace (filter `messages`/`capture_routes` by `organization_id` matching scope) and forward scope to the edge function.
- Live Capture / Memory / Schedule lists: filter by `organization_id` matching active scope. No partial sharing — if a list can't yet be scoped safely (entities, sherlock_findings, nudges, awareness_*), it stays Personal-only and shows "Personal only" sub-label when active scope is a workspace.

### d. Connected Accounts (per-user)
- New `/settings/connected-accounts` page: shows Telegram link status from `user_channel_links`, lets user set Default Route (Personal / Ask each time / Workspace:<one of their memberships>), disconnect, test message. Reuses existing `telegram-link` / `telegram-test` functions.

### e. Workspace Structure (admin)
- New `/settings/workspaces` page. Visible only to owners of at least one org (or global `admin`).
- Per workspace: name, type, slug, member table (display name, role, status, last_seen). Owner can add member by user_id (lookup via email→profile.id), change role, suspend, remove. No email invite — direct assignment only.
- Mobile-friendly card list at 384px.

### f. Copy
Vanta voice. "You're viewing Manager mode." "Only showing items in your lane." "This capture belongs to GroundStay." "You do not have access to this workspace." No exclamation marks.

## 5. Out of scope (explicitly deferred)

- Email invite flow + `workspace_invitations` table.
- `organization_id` on entities, entity_relations, sherlock_findings, nudges, awareness_*, conversations.
- WhatsApp pairing UI.
- Calendar workspace scoping.
- Per-integration ownership UI for inbound webhook handlers.
- Approval-chain expansion.
- RLS Health dashboard.

## 6. Acceptance

1. Personal user with no workspace memberships sees zero workspace UI; nothing breaks.
2. User with one workspace sees the switcher; scope persists across reloads.
3. Briefing in workspace scope returns only that workspace's signals; personal scope returns only personal.
4. Non-member querying a workspace row gets RLS-denied — verified at DB, not just hidden in UI.
5. Telegram capture honors the user's `default_route`; `ask_each_time` stays unrouted (null org_id).
6. Owner can add/remove a member from `/settings/workspaces`; non-owner gets "Your role does not include this setting."
7. 384px layout for switcher, Connected Accounts, and Workspace Structure is usable, no horizontal overflow.
8. No autonomous execution introduced. Capture still never executes.

## 7. Implementation order (single build pass)

1. Migration: organizations/memberships tightening + `user_channel_links` + add `organization_id` columns + new RLS.
2. `WorkspaceProvider` + scope-aware `useRole`.
3. Workspace switcher in cockpit shell.
4. Wire `briefing-compose` + `ReconciliationView` + `OperationsBriefingPanel` to scope.
5. Update `telegram-webhook` to use `user_channel_links` defaults.
6. Build `/settings/connected-accounts`.
7. Build `/settings/workspaces` (admin member management).
8. Mobile pass at 384px + copy pass.

Approve to switch to build mode and I'll run the migration first so you can inspect it before any code lands.
