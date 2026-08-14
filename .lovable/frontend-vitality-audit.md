# Frontend Vitality Audit + Living Interface Polish

Goal: Vanta looks calm when the world is calm, moves when something changes,
speaks when something matters, and otherwise stays out of the way.

## What was already strong
- One card surface (`.vanta-card`), one token palette, no raw hex in components.
- Shared `LoadingState` / `EmptyState` / `ErrorState` primitives.
- Surface swap already animated (`.motion-surface-in`) with scroll memory per room.
- Today already progressive: critical wave first, background wave second.

## Findings and what changed

### P0 — Motion had no shared language
Durations were hand-written per component (`duration-200`, `duration-[var(--motion-base)]`,
raw `transition-colors`). Fixed with `src/lib/motion.ts` (`MOTION_MICRO`, `MOTION_UI`,
`MOTION_PRESS`, `MOTION_ARRIVAL`, `MOTION_RESOLVE`, `MOTION_ROW`) plus
`.motion-arrival`, `.motion-resolve`, `.motion-press` in `index.css`, all covered by a
single authoritative `prefers-reduced-motion` guard.

### P1 — Today led with a count, not a state
Header said "N things waiting on you" regardless of severity. Now `todayHeadline()` in
`src/lib/todayDigest.ts` derives calm / attention / urgent from real items, and the
secondary wave collapses to one quiet line when there is nothing to report.

### P1 — Work rows said nothing about state
Project rows were title-only. Now `src/lib/workLabels.ts` supplies a status word
(Active / Needs you / Quiet / Archived) and a temporal line ("Quiet for 58 days"),
derived from stored project status and `updated_at` only — no invented signals.

### P2 — Ask room used a generic spinner
Replaced with `ProcessingLine`, which shows only what is actually true from the client:
"Reading your context" before the first token, nothing fabricated after.

### P2 — Re-entry card hierarchy was flat
`ProjectReentryCard` now leads with the project, then state · reason · last activity in
one meta line, then the grounded summary. Buttons carry press feedback.

### P2 — Scope switch was silent
`WorkspaceSwitcher` acknowledges a scope change once ("· refreshing") while scoped data
refetches, then goes quiet. Rows are 44px tap targets. No per-workspace recolouring.

## Deliberately not done
- No skeleton shimmer everywhere; existing `LoadingState` is calmer.
- No fake reasoning stages in Ask.
- No count badges on rooms that do not own records.
- No new tabs, no new surfaces, no data-model changes.

## Validation
`bunx tsgo` clean. 146/146 tests pass. Today and Work verified at 384px.
