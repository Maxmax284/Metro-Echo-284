# Frontend Vitality Pass — Living Interface Polish

No new features. No visual rewrite. This pass makes the intelligence already in Vanta legible through motion, hierarchy and state honesty.

## Step 1 — Audit report

Write `.lovable/frontend-vitality-audit.md` covering all four rooms plus specialist desks: strengths, inconsistencies, animation inventory, hierarchy problems, mobile (384px) and desktop findings, accessibility findings, visual noise, duplicated patterns, recommended motion system, semantic color model, before/after notes, deferred ideas. Issues classified P0–P3. Implementation only touches P0–P2 items with high confidence.

Known starting points already confirmed in code:
- Motion tokens exist (`--motion-fast/base/slow`, `--ease-out`) but usage is mixed: some places use raw `duration-200`, some use token durations, some use legacy `animate-fade-in`.
- Room transitions and per-room scroll memory already work; bottom-nav indicator already leads.
- `state-views` (Loading/Empty/Error) exists but is not adopted everywhere.
- Ask's processing state is a bare spinner glyph inside the message.

## Step 2 — Motion language, one place

Consolidate motion into named primitives in `src/index.css` plus a small `src/lib/motion.ts` of class constants:
- micro feedback ~140ms (`--motion-fast`), UI transitions ~240ms (`--motion-base`), sheets/dialogs ~300ms.
- Replace ad-hoc `duration-200`/`duration-300` usages in shell, nav, cards and rows with the tokens.
- Keep the existing `prefers-reduced-motion` block authoritative; every new class is listed there.

New primitives (small, reused, no library added):
- `.motion-arrival` — one-time fade+2px rise for a newly arrived row.
- `.motion-resolve` — state-change settle (opacity + 2px) for Draft→Staged→Approved→Executed and commitment completion.
- `.motion-press` — 0.98 scale on `:active` for buttons/cards (tap compression).
- Reuse existing `.motion-confirm`, `.motion-dismiss-left`, `.motion-count-pulse`.

## Step 3 — Today: state hierarchy

- Promote the top line to the real headline (large type), grounded strictly in digest state: attention count, quiet line, or "Quiet right now."
- Quiet state collapses to one calm status line + next dated item + optional resumable thread, instead of a stack of empty cards. Secondary sections (Security, What changed, Fresh in) collapse into a single quiet summary row when everything is nil.
- Attention state raises typography weight and groups by project; semantic color limited to amber/red on the affected row only.

## Step 4 — Work: state clarity

Use existing continuity/status signals to render one status word per project row (Active / Waiting / Needs you / Blocked / Quiet / Complete) plus grounded temporal context ("Quiet for 9 days · still open", "Due tomorrow"). No new queries, no raw field names.

## Step 5 — Re-entry cards

Tighten `ProjectReentryCard` to a compact hierarchy: name → status → one-line continuity summary → open/change counts → Resume · Ask · Open · Dismiss. Reduce card nesting and border stacking.

## Step 6 — Ask room

- Reduce chrome so the conversation dominates; structured blocks read as objects, not bubbles.
- Replace the bare spinner with an understated processing line driven by real request phase only (sending → waiting → streaming). No invented reasoning stages.
- Verify every structured-response link preserves room, scope and back behavior.

## Step 7 — Receipts

Motion minimal: factual rows, subtle arrival on a newly executed receipt, failures marked semantically without turning the room into an alert screen.

## Step 8 — Scope presence

Scope switcher reads as an operational boundary: current scope label always visible, and a brief refreshing acknowledgment while scoped data refetches. No per-workspace recoloring.

## Step 9 — Card and color cleanup

- Demote nested `.vanta-card` instances to rows/groups/plain text where the container adds nothing.
- Normalize semantic color usage: neutral by default; primary for Vanta/companion, blue-ish info tokens for navigation state, signal green for done, amber for waiting, danger for failed/high-risk. Any hardcoded color utilities found in the audit get moved to tokens.

## Step 10 — Loading, empty, error consistency

Adopt `LoadingState`/`EmptyState`/`ErrorState` in the surfaces that still hand-roll them; keep progressive loading so secondary feed failures render inline errors rather than blanking a room.

## Step 11 — Accessibility and mobile

Focus rings, `aria-current` on nav, `aria-live` on newly arriving counts, 44px targets, safe areas, no horizontal overflow at 384px. Verify with a Playwright pass at 384px and at desktop width, plus a reduced-motion run.

## Step 12 — Tests and validation

Extend the suite (no coverage reduction): four-room nav intact, reduced-motion degradation, room transition preserves state, arrival treatment does not duplicate rows, Today quiet vs attention wording, Work status labels, re-entry card content, scope transition, Ask structured links, receipts links, partial feed failure. Then full test suite, typecheck, lint, and visual checks.

## Explicitly deferred

Proactive notifications, nudges, voice mode, autonomous actions, new integrations, cross-scope summaries, Fenrir redesign, schema changes, avatars, 3D, particles, sound.
