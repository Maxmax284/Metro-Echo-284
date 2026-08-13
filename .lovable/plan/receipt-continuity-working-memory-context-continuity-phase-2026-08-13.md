# Receipt Continuity + Working Memory (Context Continuity Phase)

Two things in this phase: close the receipt loop after Execute, then add a small,
scoped Working Context layer so Vanta can answer "what was I working on?" from
real records.

## Part A — Receipts right after Execute

What exists today: `ExecuteConfirmDialog` is the last gate, `actions-execute`
writes an `audit_log` row (`execute.success` / `execute.failed`, `entity_type:
"action"`, `entity_id: <action id>`), and `AuditDetailDrawer` already renders a
plain-English receipt for a single audit row. Nothing links the two.

Changes:
1. After a successful execute (Actions surface and the inline approval card in
   Vanta's answers), poll for the newest `audit_log` row where
   `entity_type = 'action'` and `entity_id = <action id>`, then open
   `AuditDetailDrawer` on it immediately. If the row hasn't landed yet, the
   drawer shows a short "receipt is being written" state and retries briefly.
2. Every approval / action card gets a **Receipt** button whenever a receipt
   exists for that action. Tapping it opens the same drawer on the exact record;
   a "See in Receipts" link inside the drawer jumps to the Audit surface
   pre-filtered to that action id.
3. Verified gap to fix: the execute/transition audit inserts do not set
   `organization_id`, so in a workspace scope the receipt is written to Personal
   and disappears from workspace Receipts. Both functions will stamp the action's
   `organization_id` on the audit row (and on `action_events`), so receipts stay
   in the scope the work happened in.

## Part B — Working Context (the "resume work" layer)

### Audit of what already remembers things

- Survives reload and sign-out: `conversations` + `messages` (raw thread),
  `projects` (incl. `brief_structured`), `commitments`, `actions` + `action_events`,
  `audit_log`, `notes`, `ingested_files`, `entities`, `sherlock_findings`,
  `research_objects`, `corrections`, `profiles.preferences`.
- Survives only within one conversation: the last ~30 messages, which
  `vanta-converse` loads by `conversation_id`. A new conversation starts blind.
- Temporary / in-memory only: `CurrentContextProvider` (current surface),
  companion prefill, Today digest, scroll memory.
- Scope-aware already: the `useScope` contract + the `scope` payload already
  passed to `vanta-converse` (corrections, field notes, files are filtered).
- Duplicate risk: no "last worked on" concept exists anywhere — but `projects`,
  `audit_log`, and `project_items` together already carry the raw signal. No new
  memory system, no new assistant.

### Reuse over rebuild

No new tables. Working context is **derived**, then cached:

- Signal comes from existing rows: recent `audit_log` events, `project_items`
  touches, `actions`/`commitments` state changes, `notes` created in the window.
- The compact per-project summary is cached in the project's existing
  `metadata` JSON under a `working_context` key: `{ summary, unresolved[],
  last_decision, last_activity_at, sources[], refreshed_at, dismissed_until,
  pinned }`. Refreshable, not append-only.
- Non-project work (loose commitments/actions) is computed on the fly and never
  persisted.

### Layers, kept separate

| Layer | Lives in | Lifetime |
| --- | --- | --- |
| Conversation | `messages` for the open conversation | that thread |
| Working | derived + cached per project, scoped | decays by freshness |
| Project | `projects.brief_structured` / `metadata` | durable |
| Scope | `useScope` contract | switches with the picker |
| User memory | `profiles.preferences` | intentional only |

### Ranking + freshness

Candidates are ranked by: unresolved state, explicit commitment with a due date,
recency of last activity, pinned/focused, and interaction volume. Freshness
decay: under 48h = current, under 14 days = shows only if unresolved, older =
hidden unless pinned. If the top two candidates score within a small margin,
Vanta names both and asks which one — no confident guess.

### Today: "Continue where you left off"

One compact section, above Needs attention, rendered only when there is a real
top candidate. Per row: project name, "last worked on Xh ago", one-line state,
and Resume / Ask Vanta / Open project. Row menu: pin, dismiss from recent,
mark resolved, fix project association. Loads in the background wave so Today
never blocks on it.

### Ask Vanta

`vanta-converse` gets a `working_context` block built server-side with the same
scoped ranking: top 1-3 candidates, each with summary, unresolved items, last
activity time, and source record types. Retrieve → rank → summarize → answer —
no raw history dumping. A `what changed since` question compares the cached
snapshot's `refreshed_at` state against current rows and reports meaningful
deltas only. When there is no grounded candidate, Vanta says it does not see
recent work in this space rather than inventing continuity.

Structured responses reuse the existing block system; at most one new block type
(`resume_work`) rendered with existing card components.

### Guardrails

- Scope isolation everywhere: reads, the snapshot cache key, the AI payload, the
  Today query key. Personal never mixes with a workspace; workspace A never sees B.
- No autonomous behavior — working memory can prepare, never execute. Stage →
  Approve → Execute → Receipt and the Execute confirm gate stay untouched.
- No raw conversation persistence, no secrets or sensitive bodies in snapshots;
  summaries reference source records instead of copying them.
- Navigation unchanged — no Today / Work / Ask / Receipts consolidation here.

## Tests

New suite for the working-context ranking and freshness helpers plus scope
isolation: Personal stays Personal, org A never leaks into org B, scope switch
changes the answer, unresolved beats stale, decay hides old work, ambiguity
returns a "which one?" result, dismissed/resolved stops surfacing, no-source
returns an honest empty, cache keys include scope, and receipt lookup resolves
to the right audit row. Existing coverage stays intact; full suite + typecheck
after.

## Technical notes

- New: `src/lib/workingContext.ts` (pure ranking / freshness / delta helpers),
  `src/hooks/useWorkingContext.ts` (scoped, cached, background-loaded),
  `src/components/today/ResumeWorkSection.tsx`,
  `src/components/actions/ReceiptButton.tsx` (+ receipt lookup helper).
- Edited: `ActionsSurface`, `InlineApprovalActions`, `AuditSurface` (accept an
  action-id filter), `TodaySurface`, `useTodayDigest` (wave 2 hand-off),
  `vanta-converse` (working-context block), `actions-execute` /
  `actions-transition` (stamp `organization_id` on receipts).
- Schema: no migration. Snapshot cache rides in `projects.metadata`.
