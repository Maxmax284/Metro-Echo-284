# Stage 2 — Global Companion Widget

Per the staged plan in `.lovable/plan.md`. Stage 1 (Command Center) is live. Next: a single companion widget present on every surface that knows current context, can draft actions / commitments / searches, but cannot execute.

## What gets built

### 1. Context plumbing
- `src/providers/CurrentContextProvider.tsx` — exposes `{ route, surface, selected_entity, visible_card_ids, place_id, recent_capture_ids, pending_approval_ids, open_commitment_ids, risk_status }` + `useRegisterContext()` for surfaces to push their slice.
- Surfaces (`CommandCenterSurface`, `ActionsSurface`, `CommitmentsSurface`, `MemorySurface`, `AwarenessSurface`, `SherlockSurface`, `AuditSurface`) call `useRegisterContext({ surface, visible_card_ids, selected_entity })` on mount/selection. Read-only — no business logic touched.

### 2. Companion widget
- `src/components/companion/CompanionContext.tsx` — open state, display mode (`bubble | panel | full`), thread id, transient draft buffer.
- `src/components/companion/CompanionWidget.tsx` — floating bubble bottom-right. Click → side `Sheet` (desktop ≥768px) or bottom `Drawer` (mobile). Expand button → full-screen overlay. Uses existing semantic tokens (glass surface, primary accent), 44px+ hit targets, safe-area aware.
- `src/components/companion/CompanionThread.tsx` — message list + input. Streams from `vanta-converse` (existing edge). Same conversation history as the demoted Conversation tab so nothing is lost.
- `src/components/companion/CompanionDraftCard.tsx` — when the model proposes a `draft_action` / `create_commitment`, render an inline preview with "Open in Approvals" / "Open in Commitments" — never a one-tap execute.

### 3. Mount + routing
- `src/App.tsx` wraps `<Routes>` in `CurrentContextProvider` → `CompanionContextProvider`, and renders `<CompanionWidget />` once inside `AuthProvider` so it shows on every authenticated surface (hidden on `/auth`).
- `SurfaceTabs.tsx`: rename "Conversation" tab label to "Companion Log" (icon stays). `ConversationSurface` becomes read-only timeline view of the same `messages` table — input row is removed and replaced with a hint "Open the companion to talk." No edge function or schema change.

### 4. Tool surface in `vanta-converse`
Additive only — no behavior change to existing tools:
- `summarize_current_view(context)` → text summary using the context payload the widget sends.
- `draft_action({ title, description, payload, risk, source })` → inserts into `actions` with `status='proposed'`, returns id; widget shows draft card.
- `create_commitment({ summary, due_at?, priority? })` → inserts into `commitments`.
- `search_memory({ query, k? })` → reuses existing `memory-search`.

Mode gating placeholder: tool handlers read `user_modes` if present, else default to advisor. Hard enforcement lands in Stage 4.

### 5. Safety invariants (unchanged)
- Widget never calls `actions-execute` or `actions-transition` to `approved` / `executed`.
- Capture lanes untouched.
- `audit_log` / `action_events` append-only preserved.
- RLS unchanged; no new tables in this stage.

## Files

**New (frontend)**: `src/providers/CurrentContextProvider.tsx`, `src/components/companion/{CompanionContext,CompanionWidget,CompanionThread,CompanionDraftCard}.tsx`, `src/hooks/useCompanion.ts`.

**Edited (frontend)**: `src/App.tsx` (mount providers + widget), `src/components/shell/SurfaceTabs.tsx` (label), `src/components/surfaces/ConversationSurface.tsx` (read-only), each surface file (one-line `useRegisterContext` call).

**Edited (edge)**: `supabase/functions/vanta-converse/index.ts` — add 4 tool definitions + handlers. No change to existing tools, prompts, or auth.

**No migrations.**

## Acceptance
- Companion bubble visible on Command Center, Actions, Commitments, Memory, Awareness, Sherlock, Audit. Not on `/auth`.
- Opening on any surface, asking "what's on my plate?" returns a context-aware answer referencing the visible surface.
- Saying "draft an email to Nikki about tomorrow's class" creates an `actions` row with `status='proposed'` and shows a draft card with a button that routes to Actions — does **not** send.
- Companion Log tab still shows full history, read-only.
- No regressions in Command Center, Actions execute/approve flow, or capture lanes.

## Out of scope (later stages)
Awareness provider wiring into widget (Stage 3), mode enforcement (Stage 4), approval modal polish (Stage 5), proactive synthesis (Stage 6).
