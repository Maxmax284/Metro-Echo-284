# Stages 4 + 5 — Permission Modes & Approval Polish

## Stage 4 — Permission Modes (shipped)

- DB: `public.app_mode` enum (`locked | observer | advisor | operator`) + `public.user_modes` table (PK user_id, default `advisor`). RLS: own select/insert/update. Realtime subscription per user.
- `src/hooks/useMode.ts` — `useMode()` (fetch, set, realtime); `modeAllows(mode, intent)` helper.
- `src/components/shell/ModeBadge.tsx` — header pill + popover switcher with descriptions.
- `src/pages/Index.tsx` — `ModeBadge` mounted in header right cluster.
- `src/hooks/useIntentHandler.ts` — gates Companion intents:
  - locked: nothing
  - observer: `capture_note`, `run_sherlock`, `query_awareness` only
  - advisor/operator: full draft-only set

Server-side execution gate (actions-execute) deferred — the Companion never invokes it directly; user-driven approve/execute remains UI-gated.

## Stage 5 — Approval Modal Polish (shipped)

- `src/components/surfaces/ActionsSurface.tsx`:
  - Loads `payload`, `source`, `affected_entities`, `rollback_available` columns.
  - Approval dialog now triggered for **standard + high** risks (low_reversible stays one-click).
  - Modal shows: risk badge, source, affected entity count, rollback availability, expandable payload JSON.
  - High-risk retains "approve" confirmation phrase gate (matches `actions-transition` server enforcement).

## Remaining stages

- **Stage 6 — Proactive Synthesis**
- **Stage 7 — Mobile UX pass**
- **Stage 8 — Research & File Intelligence**
