
# Vanta V2 — Command Center, Global Companion Widget, Awareness Provider, Permission Modes

This plan honors the surgical build prompt: audit first, no duplicate systems, preserve Capture → Draft → Approve → Execute → Receipt → Audit, keep capture lanes capture-only, keep RLS owner-scoped, keep audit append-only.

On approval I will also generate a downloadable PDF (`Vanta_V2_Command_Center_Audit_and_Plan.pdf`) that mirrors this plan in the same East-Coast plain-English tone used in the prior State-of-the-Companion docs, so you have it as a portable artifact.

---

## Stage 0 — Audit (what already exists, what to reuse, what not to touch)

### Already in the codebase — reuse as-is

- **Shell & routing**: `src/pages/Index.tsx` with `SurfaceTabs` (Conversation, Awareness, Actions, Commitments, Memory, Sherlock, Audit) and `AmbientHeader`. Default landing today is Conversation.
- **Conversation**: `ConversationSurface.tsx` + `ConversationDock.tsx` (mobile voice mic added in Phase D). Edge: `vanta-converse` with `run_sherlock` and `query_awareness` tools.
- **Actions pipeline**: `ActionsSurface.tsx`, `actions-transition` (with high-risk "approve" phrase gate + `rolled_back` + `needs_credentials`), `actions-execute` (Resend, Google Calendar v3, Webhook executors, rollback tokens written into `result`).
- **Awareness**: `AwarenessSurface.tsx`, edges `awareness-brief` + `awareness-query`.
- **Sherlock**: `SherlockOverlay` + `SherlockContext` + `AnalyzeButton`, edge `sherlock-investigate` with structured envelope and findings cache.
- **Memory**: `MemorySurface`, `memory-search`, `memory-autolink`, `embeddings-generate`.
- **Commitments**: `CommitmentsSurface`, `commitment-reminders` cron.
- **Capture lanes**: `email-inbound`, `files-ingest` (PDF/DOCX/OCR), `telegram-webhook` + `telegram-link`, mic via Web Speech API. Capture-only — none write to executors.
- **Audit**: `AuditSurface`, `audit_log` append-only, `action_events` lineage.
- **Cross-cutting**: `useSherlock`, `operationalState.ts`, semantic Tailwind tokens in `index.css` / `tailwind.config.ts`, shadcn primitives.
- **DB**: 24 owner-scoped RLS tables, `actions` extended with `risk_acknowledged_at / rollback_available / rollback_token / executed_at / rolled_back_at`, `sherlock_findings_cache`, executor configs (`action_executors`).

### Must NOT touch

- `src/integrations/supabase/{client,types}.ts`, `.env`, `supabase/config.toml` project-level settings.
- RLS policies (only extend, never weaken).
- `action_events` / `audit_log` append-only semantics.
- High-risk approval phrase gate in `actions-transition`.
- Capture-lane isolation: no edge function called from `email-inbound`, `telegram-webhook`, `files-ingest`, or the voice mic may call `actions-execute` directly.

### Gaps the prompt targets (the missing ~25–30%)

1. No Command Center — app opens chat-first.
2. Conversation is a tab, not a global widget; doesn't carry `current_context`.
3. Awareness is page-bound, not a provider feeding other surfaces.
4. No visible Observer / Advisor / Operator / Locked modes.
5. Approval cards lack risk/source/affected-system/rollback panel polish.
6. No proactive synthesis loop.
7. Mobile is okay but not cockpit-grade.

### Architecture decisions before any code

- Command Center is a **frontend orchestration surface**. No new source-of-truth tables. Aggregation via shared hooks reading existing tables.
- Companion is one widget with three display states (bubble / side panel / full). The existing Conversation tab becomes "Companion Log" (read-only history view).
- Awareness becomes a React provider over the existing `awareness-brief` output plus a thin in-memory cache; no new DB.
- Permission Modes: single new tiny table `user_modes(user_id pk, mode text, updated_at)` + a `useMode()` hook. Enforcement happens in (a) widget tool-routing, (b) `actions-transition` (deny approve in Observer/Locked), (c) `actions-execute` (deny dispatch unless Operator). Mode changes write `audit_log`.

---

## Stage 1 — Command Center MVP (frontend-only, no new source-of-truth tables)

- New route `/` → `CommandCenterSurface.tsx`. Move current Conversation off the landing position. Keep all existing tabs reachable from `SurfaceTabs`.
- **Zone 1 — Ambient Intelligence Header**: reuse `AmbientHeader`, extend with mode badge, place/time, pending-approvals count, high-risk count, open-commitments count, Sherlock-flag count, last awareness refresh.
- **Zone 2 — Operational Grid** (7 cards, all read from existing tables via new shared hooks in `src/hooks/commandCenter/`):
  - Today, Approvals (by risk), Live Capture, Commitments, Sherlock Watchtower, Memory Pulse, System Receipts.
  - Every card supports: View · Open source · Analyze (opens Sherlock overlay) · Open original surface. Approvals card delegates to existing Actions modal — never executes inline.
- **Zone 3 — Command Input**: thin wrapper around the same `vanta-converse` engine the widget uses, so behavior is identical.

Empty / loading / error / stale / low-confidence states on every card.

---

## Stage 2 — Global Companion Widget

- New `src/components/companion/CompanionWidget.tsx` + `CompanionContext.tsx`. Mount in `App.tsx` so it appears on every primary surface.
- States: floating bubble → side `Sheet` (desktop) / bottom `Drawer` (mobile) → full-screen mode.
- Reuses `vanta-converse` and the existing tools (`run_sherlock`, `query_awareness`) plus new tools: `summarize_current_view`, `draft_action`, `create_commitment`, `search_memory`.
- New `CurrentContextProvider` exposes `{ route, selected_entity, visible_card_ids, mode, place_id, recent_capture_ids, pending_approval_ids, open_commitment_ids, risk_status }`. Surfaces register their context via `useRegisterContext()`.
- Demote `ConversationSurface` to "Companion Log" — same data, read-only timeline view; preserves history.
- Safety: widget can draft, never execute. If user says "send it," it creates an action draft and opens the Approvals card.

---

## Stage 3 — Awareness Context Provider

- New `AwarenessProvider` wrapping `awareness-brief` output with `{ data, status: 'fresh'|'stale'|'loading'|'error', confidence, sources, refresh() }`.
- Hooks: `useAwareness()`, `useAwarenessSlice('risk' | 'calendar' | 'commitments' | …)`.
- Consumed by Command Center header & cards, companion widget, Actions risk hints, Sherlock context, Memory pattern surfacing.
- No new tables; cache lives in provider + existing `awareness_briefings` table already present.

---

## Stage 4 — Permission Modes

- Tiny migration: `user_modes` table (owner-scoped RLS) + enum `app_mode ('observer','advisor','operator','locked')`.
- `useMode()` hook + mode badge in Command Center header and Companion header.
- Enforcement points:
  - `vanta-converse`: refuses `draft_action` in Locked; refuses execution-style tool calls always (already true).
  - `actions-transition`: rejects `approved` transition in Observer/Locked.
  - `actions-execute`: rejects dispatch unless Operator.
- Mode change writes `audit_log` event `mode:changed` with from/to.

---

## Stage 5 — Approval Queue Polish

- Enhance existing high-risk modal in `ActionsSurface`: show risk class, source surface, affected entities (from `payload.entities`), expected result, rollback availability, latest Sherlock findings inline, type-to-confirm "approve".
- Mobile-safe: full-screen sheet, sticky confirm bar, large hit targets, no accidental approves.
- Recently Executed + Rolled Back panels (already partly wired via Phase B).

---

## Stage 6 — Proactive Synthesis

- New cron edge function `proactive-synthesis` (daily + nightly). Reads commitments, captures, actions, memory, awareness; writes suggestions into existing `nudges` / `awareness_briefings` tables. Never executes.
- Output surfaces in Command Center Sherlock Watchtower + Memory Pulse cards and a "Suggestions" strip in the companion widget.

---

## Stage 7 — Mobile UX pass

- Command Center stacked layout with safe-area padding, sticky bottom companion launcher, swipeable card carousel for secondary zones, 44px+ hit targets, no destructive single-tap actions.

---

## Stage 8 — Research & File Intelligence (only after 1–7 stable)

- Widget tools: `research.quick`, `research.deep`, `research.local`, `source.review`, `decision.brief`. If no live search secret is configured, render "Planned" affordance — never fake results. File intelligence extends existing `files-ingest` (already does PDF/DOCX/OCR) with widget-side next-step prompts.

---

## Acceptance checks (mirrors the prompt)

- App opens to Command Center; existing surfaces intact and reachable.
- No new source-of-truth tables for orchestration; only `user_modes` added.
- Widget present on every primary surface, knows `current_context`, drafts but cannot execute.
- Awareness feeds ≥3 surfaces beyond its own page.
- Mode badge visible; Observer/Advisor/Operator/Locked enforced server-side.
- High-risk approvals still require typed "approve"; executions still write `audit_log` + `action_events`.
- Capture lanes still capture-only (verified by static check: no import of `actions-execute` from `email-inbound`, `telegram-webhook`, `files-ingest`).
- RLS unchanged or strengthened; audit append-only preserved.

---

## Technical notes (engineer-facing)

- **New files (frontend)**: `src/pages/CommandCenter.tsx`, `src/components/commandCenter/{AmbientHeader2,ApprovalsCard,TodayCard,LiveCaptureCard,CommitmentsCard,SherlockWatchtowerCard,MemoryPulseCard,SystemReceiptsCard,CommandInput}.tsx`, `src/components/companion/{CompanionWidget,CompanionContext,CompanionTools}.tsx`, `src/providers/{AwarenessProvider,CurrentContextProvider,ModeProvider}.tsx`, `src/hooks/commandCenter/*`.
- **New files (edge)**: `supabase/functions/proactive-synthesis/index.ts` (Stage 6).
- **DB migration (only one)**: `user_modes` table + `app_mode` enum + RLS own-row policies + `audit_log` trigger on update.
- **Edge function edits**: `vanta-converse` adds context-aware tools and mode-gating; `actions-transition` and `actions-execute` read `user_modes` and reject when mode forbids; no other backend behavior changes.
- **Routing**: `App.tsx` mounts `CommandCenterSurface` at `/`, keeps `/conversation` (Companion Log), wraps tree in `ModeProvider` → `AwarenessProvider` → `CurrentContextProvider` → `CompanionContext`.
- **Theme**: only semantic tokens (existing dark glass palette). No raw hex.
- **Order of merge**: Stage 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Each stage ships green.

---

## Deliverable

On approval I will (a) start Stage 1, and (b) generate `Vanta_V2_Command_Center_Audit_and_Plan.pdf` to `/mnt/documents/` so you have the audit + staged build as a portable artifact in the same tone as the previous State-of-the-Companion docs.
