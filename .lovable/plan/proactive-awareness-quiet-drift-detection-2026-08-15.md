# Proactive Awareness — Quiet Drift Detection

## Audit: what already exists

- **`nudges` table** with per-user RLS, `dedupe_key` unique index, `priority`, `status` (pending/seen/dismissed), `related_entity_*`. Good enough — no schema change needed except one nullable scope column.
- **`ambient-pulse` edge function** already writes nudges on app open: overdue commitments, due today, approved-but-unexecuted actions, stale captures, arrival briefings. Rate limited to 12/min.
- **`sherlock-watch`** writes pattern nudges (heat, pairing, quiet).
- **`NudgesPanel.tsx`** renders them — but only as a collapsed pill in the shell, not in Today.
- **Quiet hours already exist** in profile preferences (`quiet_hours_start` / `quiet_hours_end`) and are honored by Telegram reminders only.

## Real gaps this phase closes

1. **Scope leak.** `nudges` is listed in `SCOPED_TABLES` but `NudgesPanel` reads it unscoped and `ambient-pulse` neither filters its source reads nor stamps `organization_id` on write. Personal-scope nudges can surface inside a workspace and vice versa.
2. **Quiet hours ignored** for in-app proactive signals.
3. **No opt-in.** Proactive detection currently runs whether or not the user asked for it.
4. **No drift detection** — the actual "proactive awareness" capability. Nothing notices a project going silent, a commitment quietly sliding, or a flagged risk sitting unread.
5. **Nudges are not in Today**, so the one room that should say "here's what I noticed" doesn't.

## What gets built

### 1. Scope integrity (P0, first)
- Migration: add nullable `organization_id` to `public.nudges` + index; backfill stays null (Personal).
- `ambient-pulse` resolves the active scope from the request body, filters every source read by it, and stamps `organization_id` on insert. `dedupe_key` gains a scope segment so the same drift in two workspaces stays two distinct nudges.
- `NudgesPanel` and all new readers go through `applyScope`.

### 2. Drift detectors (new, pure logic)
New `src/lib/drift.ts` — pure, testable functions over rows already fetched:
- **Project went silent**: a project with unresolved items and no activity for N days (default 10), where it was active before.
- **Commitment drifting**: an open commitment whose due date has been pushed, or which is inside 48h with no linked activity.
- **Risk unread**: a flagged risk or high-risk staged action with no receipt and no view event.

Each detector returns at most one candidate signal with: title, plain-English reason, related entity, and a suggested next step. Detectors never write, never call AI.

### 3. One signal at a time, always a draft
- A new `awareness-drift` path inside `ambient-pulse` (no new function) runs the detectors, ranks candidates, and writes **only the single highest-priority** one per pulse.
- Nudges remain drafts: they suggest, they never stage, approve, or execute anything. Tapping one navigates to the owning surface where the normal Plan → Approve → Execute gate applies.

### 4. Quiet hours + opt-in
- New preference `proactive_awareness_enabled` (default **off**) plus reuse of existing quiet hours.
- Inside quiet hours: detectors still run, but nothing is written until the window closes — no queue flood, dedupe keys keep it to one per day per signal.
- Settings row under Time & Reminders: one switch, one line of copy explaining what Vanta will and won't do.

### 5. Today surface presence
- A single **"Vanta noticed"** row in Today's attention area, mono label + reason + one tap-through. Never more than one at a time; dismiss is one tap and sticks.
- When there's nothing, the row is absent entirely — no empty box.

### 6. Audit
Every proactive nudge written, dismissed, or acted on emits an audit event (`nudge.proposed`, `nudge.dismissed`, `nudge.followed`) so receipts stay complete.

## Explicitly not in this phase
No push notifications, no AI-written nudge copy, no auto-execution, no cross-scope views, no new tab, no Fenrir/awareness rebuild, no changes to existing reminder delivery.

## Technical notes
- New: `src/lib/drift.ts`, `src/components/today/NoticedRow.tsx`, `src/test/drift.test.ts`.
- Edited: `supabase/functions/ambient-pulse/index.ts` (scope + detectors + quiet-hours gate), `src/components/NudgesPanel.tsx` (scoped reads), `src/components/surfaces/TodaySurface.tsx`, `src/hooks/useTodayDigest.ts` (carry the one noticed signal), `src/hooks/useUserPreferences.ts`, `src/components/settings/TimeRemindersSection.tsx`.
- One migration: `nudges.organization_id` + index. Existing GRANTs and RLS unchanged.
- Tests: each detector fires on the right shape and stays silent otherwise; quiet-hours gate suppresses writes; scope isolation on nudge reads; only one signal surfaces per pulse; opt-out means zero writes. Current suite is 158 passing — coverage does not shrink.
