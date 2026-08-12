# Vanta End-to-End Companion Audit

Date: 2026-08-12 · Scope: full app (routes, surfaces, DB, RLS, AI, memory, integrations, mobile, a11y)
Status: audit + safe cleanups pass. No schema migrations. No destructive rewrites.

Inspiration note: E.V. is used only as a reminder of *continuity, context, trust, low-friction*. No sci-fi
aesthetics, no fictional capabilities, nothing claimed that does not run today.

---

## 0. Measured Baseline

| Metric | Value |
| --- | --- |
| Tab-rail surfaces | 12 (`command, inbox, projects, briefs, receipts, schedule, conversation, memory, commitments, actions, sherlock, awareness`) |
| Extra routes | `/settings`, `/settings/workspaces`, `/settings/integrations`, `/projects`, `/projects/:id`, `/documents`, `/connected-accounts`, `/reconciliation` |
| Edge functions | 46 |
| Component folders | 27 |
| Largest surface | `CommandCenterSurface.tsx` — 806 lines |
| Files using a spinner | 65 |
| Files using a skeleton | 2 |
| Surfaces applying the active workspace scope | **0 of 12** |
| `ring-border/*` opacity variants in use | 30, 40, 50, 60, 70 |
| Icon-only buttons without an accessible name | 8+ |

The one-sentence diagnosis: **Vanta is feature-complete and surface-fragmented.** Five product jobs are spread
across twelve front doors, and the workspace switcher is decorative.

---

## A. What Currently Works Well

1. **Capture layer is genuinely good.** Voice, file drop, share target, screenshot paste, Telegram, email
   inbound, external-platform webhooks all land staged and never auto-execute. The doctrine holds in code.
2. **Audit/receipt discipline.** `audit_log` is written from nearly every state change, and
   `capture_routes` records the aftermath of each captured item. Receipts are real, not decorative.
3. **Action safety model.** `actions` has `risk`, `status` (proposed → staged → approved → executed →
   audited → rolled_back), `rollback_token`, `risk_acknowledged_at`, and an append-only `action_events`
   trail. Execution is conservative by construction.
4. **Entity graph + semantic retrieval.** `entities`, `entity_links`, `entity_relations`, `cross_links`,
   `memory_search`, `notes_related`, `entities_semantic_match`, `entity_rollup`, `system_rollup`. The
   substrate for "what was I working on yesterday?" already exists.
5. **Plain-English language layer.** `plainLabels.ts`, `plainEnglish.ts`, `bulletinLanguage.ts`,
   `vantaVoice.ts` with a banned-token scrub. Rare and worth protecting.
6. **Kill switches.** `system_controls` gives per-provider and global posture control, honoured server-side.

---

## B. What Is Fragmented

| Product job | Where it lives today | Count |
| --- | --- | --- |
| Awareness | `awareness`, `sherlock`, `command` (bulletin, pulse, briefing), `NudgesPanel` | 5 |
| Memory | `memory`, `inbox`, `briefs`, `/documents`, `MemoryFilesView`, `CapturesView` | 6 |
| Planning | `schedule`, `commitments`, `projects`, `/projects/:id` | 4 |
| Execution | `actions`, `ExecutorsCard`, `DocumentToolPlan` | 3 |
| Governance | `receipts`, `/settings` (8 sections), `ReconciliationView` | 3 |

Additional fragmentation:

- **Three "structured brief" generators.** `compose-brief`, `briefing-compose`, `project-summarize`,
  `recap-compose`, and `research-run` all emit near-identical brief JSON into `brief_exports` with
  different `format` values, rendered by `BriefRenderer`, `BriefPdfDocument`, and `projectSummaryPdf`.
- **Two suggestion chip systems.** `SherlockFindingsChips` (internal) and `ResearchSuggestionChip`
  (external) render in the same three places with different visual language.
- **Two conversation entry points.** `ConversationSurface` (mounted `readOnly`) and `ConversationDock` /
  `CompanionWidget`. Neither is the canonical way to ask Vanta anything.
- **Loading/empty states are ad hoc.** 65 files hand-roll a spinner; 2 use skeletons; empty copy is inline
  string literals in every surface.

---

## C. What Should Be Removed

| Item | Why |
| --- | --- |
| `scripts/footer_test.tsx` … `footer_test5.tsx`, `scripts/qaExportPolish.tsx` | Dead scratch files shipped in-repo. |
| `MiniRadarStrip` / `AwareCockpitCard` overlap in the shell header | Two ambient strips saying the same thing above the fold. |
| `ReconciliationView` as a top-level route | Its content belongs inside Receipts as a filter. |
| Standalone `awareness` tab | Its value is one ranked strip on Today; the full page is a cockpit. |
| Per-surface bespoke empty-state copy | Replaced by one primitive (done in this pass). |

Nothing here is deleted in this pass except dead scratch files. The rest is documented for the next phase.

---

## D. What Should Be Consolidated

1. **One brief pipeline.** A single `brief` shape + one renderer + one PDF path; `format` stays the only
   discriminator. Deletes ~3 near-duplicate render trees.
2. **One suggestion chip.** `<VantaSuggestion kind="internal" | "external">` replacing both chip systems.
3. **One state-view primitive.** `LoadingState` / `EmptyState` / `ErrorState` (added in this pass).
4. **One card surface.** `.vanta-card` utility replacing 98 hand-composed `surface-elevated + ring-1 +
   ring-border/{30,40,50,60,70} + rounded-{md,lg,xl,2xl}` combinations.
5. **One capability registry.** Extend `src/lib/integrations/registry.ts` into the capability model in §19
   rather than creating a parallel abstraction.

---

## E. UI / UX Issues

| ID | Severity | Issue |
| --- | --- | --- |
| UI-1 | P1 | 12 tabs in a 384px bottom nav is a horizontal scroll strip, not navigation. |
| UI-2 | P1 | `CommandCenterSurface` at 806 lines shows everything simultaneously — the exact giant dashboard the product philosophy forbids. |
| UI-3 | P2 | Five `ring-border` opacities and four radii across sibling cards. |
| UI-4 | P2 | Spinner-only loading (65 files) causes layout jump; only 2 files use skeletons. |
| UI-5 | P2 | Header stacks `AmbientHeader` + `NudgesPanel` + `MissingSecretsBanner` + surface header before any content on mobile. |
| UI-6 | P3 | Empty states read as errors ("No X yet") instead of explaining what connecting a service would enable. |
| UI-7 | P1 | Conversation is `readOnly`, so the conversational entry point the product is named for cannot be used. |

---

## F. Architectural Issues

| ID | Severity | Issue |
| --- | --- | --- |
| ARCH-1 | **P0** | **No surface applies the active workspace scope.** `useActiveScope` / `useActiveOrgId` exist in `WorkspaceProvider` and are consumed by exactly 2 modules (`projects.ts` and the provider itself). All 12 surfaces query without an `organization_id` filter. See §G. |
| ARCH-2 | P1 | 46 edge functions with overlapping jobs (5 brief composers, 6 inbound webhooks with near-identical bodies). `_shared/externalPlatform.ts` exists but is not used by all inbound functions. |
| ARCH-3 | P1 | No capability abstraction. Product-specific behavior (Telegram, GTH, CampCore, Fenrir) is hard-coded per function and per card. |
| ARCH-4 | P2 | Fenrir is an inbound webhook + a `system_controls.fenrir_enabled` flag. There is no governance layer. See §9. |
| ARCH-5 | P2 | `CurrentContextProvider` and `useOperationalState` are inferred-state stubs nothing consequential reads. |

---

## G. Security / Tenant Risks

### P0-1 — Workspace rows render inside Personal scope

**Confirmed by inspection, not inferred.**

RLS on `notes`, `commitments`, `actions`, `messages`, `ingested_files`, `audit_log` is a two-policy pattern:

```
personal:  (organization_id IS NULL)     AND auth.uid() = user_id
workspace: (organization_id IS NOT NULL) AND is_org_member(organization_id, auth.uid())
```

That is a correct database design. The client is the problem: no surface passes an `organization_id`
filter, so every query returns the **union** of your personal rows and every row from every workspace you
belong to — regardless of the switcher.

Consequences:
- Switching scope in `WorkspaceSwitcher` changes the label and nothing else.
- A shared workspace's notes/files/commitments appear inside a member's Personal view.
- Once an associate (e.g. Nikki on a shared workspace) writes a workspace-scoped note, it appears in the
  owner's Personal surfaces and in the owner's Command Center counts.

This is not a database breach — RLS is holding — it is a **scope-isolation failure at the query layer**, and
it directly violates the stated law "Active scope filters every query."

Fix (next move, not this pass — it changes what data appears on screen):
1. Add `src/lib/scopedQuery.ts` — `applyScope(query, scope)` → `.eq("organization_id", id)` for workspace,
   `.is("organization_id", null)` for personal, unfiltered for admin.
2. Route all 12 surfaces' reads through it.
3. Stamp `organization_id` on every write from the active scope.
4. Add a test asserting a workspace row never appears in a personal-scope result.

### P0-2 — Writes do not stamp scope

Most inserts omit `organization_id`, so items captured while a workspace is active are silently written as
personal. Same fix as above, write side.

### P1-3 — Linter findings

- 2 tables with RLS enabled and **no policies** (`awareness_overpass_cache`, `rate_limit_buckets`) — these
  are intentionally server-only. Correct posture; documented so it is not "fixed" later.
- 16 `SECURITY DEFINER` functions executable by `anon`. Every one re-checks `auth.uid()` internally and
  raises `not authenticated`, so the exposure is a wasted round-trip rather than a data path. Recommend
  `REVOKE EXECUTE ... FROM anon` on all 16 as defence-in-depth.
- 2 extensions in `public` (`vector`) — accepted, moving it is riskier than leaving it.

### P2-4 — Role model gap

`organization_members.role` is `owner_admin | manager | member | viewer`, but no surface varies by role. A
`viewer` sees the same controls as an `owner_admin`, and enforcement rests entirely on RLS write policies.
Role-aware UI is unbuilt.

---

## H. Performance Concerns

| ID | Severity | Issue |
| --- | --- | --- |
| PERF-1 | P1 | `CommandCenterSurface` fires many independent queries on mount (bulletin, checklist, pulse, rollups, nudges, briefing) with no shared cache. Every tab return refetches. |
| PERF-2 | P2 | No `@tanstack/react-query` usage in surfaces despite it being available — every surface hand-rolls `useEffect` + `useState` fetching. |
| PERF-3 | P2 | Surfaces are all statically imported into `Index.tsx`; nothing is lazy. `CommandCanvas`, PDF export (`@react-pdf/renderer`), and Documents are the heaviest and load on first paint. |
| PERF-4 | P3 | `entity_rollup` and `system_rollup` are heavy plpgsql called on render with no client cache. |

---

## I. Partially Implemented Features

| Feature | Status |
| --- | --- |
| Capture (voice, file, share, paste, Telegram, email) | **Already functional** |
| Memory + entity graph + semantic search | **Already functional** |
| Commitments, actions, receipts, audit | **Already functional** |
| Projects + living brief + project summary | **Already functional** |
| Sherlock findings | **Already functional** (ambient chips + surface) |
| Research briefs | **Already functional** (approval-gated) |
| Recaps (weekly/monthly) | **Already functional** (manual trigger only) |
| Documents draft/review/export | **Already functional**; obligation tracking + version compare parked |
| Workspaces / multi-tenant | **Backend exists, UI incomplete** — see P0-1 |
| Role-aware experience | **Backend exists, UI missing** — no surface reads `org_role` |
| Conversational interface | **UI exists, backend incomplete** — mounted `readOnly`; `vanta-converse` exists |
| Structured UI returned from conversation | **Future capability** |
| Fenrir as governance layer | **Future capability** — webhook only today |
| Calendar context | **Future capability** — flag exists, no adapter |
| Push notifications | **Already functional** (VAPID + diagnostics) |
| CampStay / CampCore / OpsLedger / Lamai / SoiCat adapters | **Future capability** — `campcore-inbound`, `gth-inbound`, `fenrir-inbound` are capture-only webhooks |

---

## §5. Conversational Interface — Assessment

`ConversationSurface` is mounted with `readOnly`, `vanta-converse` exists server-side, `companionTools.ts`
declares tools, and `useIntentHandler` can route intents. So the wiring is 80% there and the faucet is off.

Target contract (next phase, not this pass):

- Conversation returns **typed blocks**, not prose: `text`, `card`, `list`, `approval`, `receipt`, `signal`.
- Each block renders with an existing component (`SignalCard`, `CommitmentActions`, `AuditDetailDrawer`,
  `ActionButton`) so conversation and GUI share one component vocabulary and cannot drift.
- Navigation intents ("open the booking that needs attention") resolve to a surface + focus ID, reusing the
  existing `focusCommitmentId` pattern in `Index.tsx`.
- Every write intent produces a **staged action**, never an execution. No exceptions.

## §6. Context and Memory — Assessment

Remembered today: notes, captures, messages (with embeddings), commitments, entities, cross-links,
projects, files, corrections, audit. All keyed to `user_id`. Inspectable via Memory surface; correctable via
`CorrectionsCenter`. Sensitive flagging exists (`sensitive`, `sensitive_flag`, `privacy_settings`).

Gaps: conversation context does not survive a session in a usable way (`conversations.state` is written but
no surface resumes from it), and the five scopes below are not distinguished anywhere.

Recommended explicit scopes (naming only, no schema change): `conversation` (session), `working`
(ephemeral, expires), `personal` (`organization_id IS NULL`), `organization` (`organization_id = X`),
`project` (`project_items`). Four of the five already map to existing columns — this is a discipline
problem, not a modelling one.

## §9. Fenrir Seam (designed now, unbuilt)

Fenrir must not appear as a separate product. Contract:

```ts
// A security event Vanta can surface without knowing anything about Fenrir internals.
type TrustEvent = {
  id: string;
  severity: "info" | "attention" | "critical";
  category: "auth" | "permission" | "session" | "anomaly" | "sensitive_op";
  plain_summary: string;   // "1 sign-in was blocked. No action required."
  technical_detail?: string; // admin-only, behind progressive disclosure
  occurred_at: string;
  actor_label?: string;
  requires_action: boolean;
  suggested_action?: { kind: "revoke_session" | "review_permission" | "acknowledge"; target_id: string };
};
```

Rules:
- Fenrir writes `TrustEvent`s through `fenrir-inbound`; Vanta never calls Fenrir UI.
- Normal users see the aggregate line only. Admins expand for `technical_detail`.
- `suggested_action` becomes a **staged action** with `risk = high`. Fenrir cannot execute through Vanta.
- Receipts land in `audit_log` with `entity_type = 'trust_event'`.

Building this needs a `trust_events` table and one surface strip. Deferred — the seam is defined so it drops
in without a rewrite.

## §12. Notifications and Attention

Today: `nudges` (with `dedupe_key`, priority, expiry) + push + `DailyBulletinCard` buckets. The dedupe key
is the right instinct. Missing: **cross-source rollup**. Twelve CampStay events should collapse to one line
with a drill-in, which means grouping by `related_entity_type` + `kind` before render, not after.

## §13. Mobile

Good: bottom nav exists, capture is thumb-reachable, 44px targets were done in the polish pass, surface
transitions and scroll memory ship, PWA + share target + paste work.

Bad: 12 tabs in the bottom strip; four stacked bars before content; `ConversationSurface` input sits behind
a read-only guard; no `env(safe-area-inset-bottom)` padding on the bottom nav; wide tables in
`RegistryTables` and `WorkspaceStructure` overflow at 384px.

## §16. Accessibility

- 8+ icon-only buttons with no accessible name (fixed in this pass).
- Only 2 files use skeletons, so screen readers get no `aria-busy` signal during loads (the new
  `LoadingState` primitive sets it).
- Status is frequently colour + text (good), but `RISK_TONE` / `CONFIDENCE_TONE` chips rely on colour plus a
  word — acceptable.
- No `prefers-reduced-motion` guard on the new surface-transition animation (fixed in this pass).

## §17. First-Run

`FirstRunWalkthrough`, `SystemMap`, `FollowOneNoteDemo`, and `WhatIsThis` exist and are good. The gap is
that empty surfaces say "No notes yet" instead of "Nothing captured yet — voice, share, or drop a file and it
lands here." The new `EmptyState` primitive takes an `action` and a `hint` so the copy can teach.

## §18. AI For AI's Sake — Verdict

| Feature | Verdict |
| --- | --- |
| Sherlock ambient chips | **Earns it** — surfaces conflicts nobody would find manually. |
| Research suggestion chips | **Earns it, but duplicated** — consolidate into one chip. |
| Project summary / living brief | **Earns it** — saves real assembly work. |
| Weekly/monthly recaps | **Provisional** — keep, but if unopened for 30 days, cut. |
| `ambient-pulse` / `ProductivityPulseCard` | **Does not earn it** — a score with no decision attached. Demote to a single line or remove. |
| `sherlock-patterns` | **Unclear** — no surface consumes it prominently. Prove it or cut it. |
| `useOperationalState` | **Does not earn it** — inferred state nothing acts on. |

## §19. Vanta Capability Model

```ts
export type VantaCapability =
  | "awareness" | "memory" | "search" | "summarization"
  | "planning" | "recommendations" | "drafting"
  | "read_actions" | "write_actions" | "approvals"
  | "notifications" | "security_context" | "business_context";

export type VantaAdapter = {
  key: string;                       // "campstay" | "campcore" | "gth" | "fenrir" | "telegram"
  label: string;
  capabilities: VantaCapability[];   // what it exposes
  scope: "personal" | "organization" | "both";
  read: (q: AdapterQuery) => Promise<AdapterResult>;
  stage?: (intent: AdapterIntent) => Promise<StagedAction>; // never executes directly
};
```

Rules: `write_actions` always routes through `actions` staging. No adapter renders its own UI inside Vanta.
Extend `src/lib/integrations/registry.ts` rather than starting a parallel registry.

---

## J. Recommended Next Phase — "Vanta Today"

The smallest coherent phase that moves toward the companion model. Four tightly-related pieces, one theme.

1. **Fix scope isolation (P0-1, P0-2).** `scopedQuery.ts` + all reads/writes routed through it + a test.
   Non-negotiable and first — everything else is built on trust.
2. **Collapse 12 tabs → 4.** `Today` (attention + schedule + bulletin) · `Work` (inbox + projects + memory
   + briefs + documents) · `Ask` (conversation) · `Receipts` (audit + sherlock + trust). Settings stays a
   route.
3. **Today becomes an urgency-ranked page, not a dashboard.** Greeting + ask box → needs attention → today
   → recent changes → suggested next → connected systems. Each section max 3 items with "show more".
4. **Turn Ask on.** Remove `readOnly`, add the typed-block response contract from §5, and make every write
   intent produce a staged action.

Explicitly **not** in this phase: Fenrir trust surface, calendar adapter, CampStay/OpsLedger adapters,
role-aware UI, brief-pipeline consolidation, react-query migration.

## K. Nice-To-Haves That Should NOT Be Built Yet

- Autonomous execution of any kind, including "safe" ones.
- Cross-tenant admin dashboards.
- Real-time subscriptions on capture tables.
- A second chat surface anywhere.
- Fenrir UI embedded in Vanta.
- Multi-doc contract reports, obligation tracking, attorney handoff (already parked).
- Any new tab.

---

## Priority Register

| ID | Priority | Item |
| --- | --- | --- |
| P0-1 | P0 | Workspace rows render inside Personal scope (query-layer isolation failure) |
| P0-2 | P0 | Writes do not stamp `organization_id` from active scope |
| P1-3 | P1 | `REVOKE EXECUTE` on 16 `anon`-callable SECURITY DEFINER functions |
| UI-1 | P1 | 12-tab navigation collapse |
| UI-2 | P1 | Command Center is a giant dashboard |
| UI-7 | P1 | Conversation is read-only |
| ARCH-2 | P1 | Overlapping edge functions |
| PERF-1 | P1 | Command Center query storm on every tab return |
| P2-4 | P2 | No role-aware UI |
| UI-3/4/5 | P2 | Design-token drift, spinner-only loading, header stacking |
| ARCH-4 | P2 | Fenrir governance layer (seam defined, unbuilt) |
| PERF-2/3 | P2 | react-query migration, lazy surfaces |
| UI-6 | P3 | Teaching empty states |
| Future | Future | Adapters, calendar, trust surface, brief-pipeline merge |

---

## Changes Implemented In This Pass (safe only)

1. `src/components/ui/state-views.tsx` (new) — `LoadingState` (skeletons + `aria-busy` + `sr-only` label),
   `EmptyState` (teaching copy + optional action), `ErrorState` (plain English + retry).
2. Adopted the primitives in `BriefExportsList`, `InboxNotesList`, and `ProjectsSurface` as proof. The
   remaining 62 hand-rolled spinners are documented under UI-4, not swept in this pass.
3. `src/index.css` — `.vanta-card` utility: one surface, one radius, one hairline ring. Replaces the
   ad-hoc `surface-elevated + rounded-{md,lg,xl,2xl} + ring-border/{30,40,50,60,70}` combinations.
4. Accessible names added to the 4 genuinely unlabeled icon-only buttons (`EmailInboxCard` ×2,
   `ExecutorsCard` ×1; the `ui/sidebar.tsx` trigger is upstream shadcn and already has an `sr-only` label).
5. **Fixed 2 pre-existing failing tests.** 12 files imported `toast` from `sonner` directly, bypassing the
   `vantaVoice` wrapper that owns Vanta's tone; all now route through `vantaToast`. Four two-arg call sites
   in `IntegrationCard` converted to the wrapper's `{ title, description }` shape. One false-positive
   banned-phrase hit in a `ProjectBriefView` code comment reworded.
6. Removed 6 dead scratch files under `scripts/` (`footer_test*.tsx`, `qaExportPolish.tsx`).

Suite status after this pass: **47/47 passing** (was 45/47). Typecheck clean.

### Corrections to earlier assumptions

Two things were already handled and are *not* issues, contrary to a first read:

- `prefers-reduced-motion` already guards `.motion-surface-in`, the radar animations, and the drawer motion.
- The bottom nav already applies `.safe-bottom` (`env(safe-area-inset-bottom)`).

No schema changes. No behavior changes. No navigation changes.
