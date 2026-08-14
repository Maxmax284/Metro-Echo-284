# Street-Tech Visual Polish Pass

Style and motion only. No new features, no nav changes, no data or scope changes, no new dependencies. Everything reuses the existing motion primitives and token system.

## Step 1 — Audit document

Write `.lovable/street-tech-visual-audit.md` covering all four rooms plus specialist desks, dialogs, sheets, cards, buttons, tabs, badges, status labels, empty/loading states, mobile 384px and desktop. Each finding classified Keep / Refine / Remove / Optional. Before/after notes appended after implementation.

Confirmed starting points from the code:
- One card surface (`.vanta-card`), one token palette, no raw hex in components.
- Motion primitives already exist and are all listed under a single `prefers-reduced-motion` guard: `.motion-arrival`, `.motion-resolve`, `.motion-press`, `.motion-confirm`, `.motion-dismiss-left`, `.motion-count-pulse`, `.motion-surface-in`, `.motion-breath`, `.motion-stagger`.
- `--accent` is already the purple token (268 70% 66%), but the interface leans almost entirely on cyan `--primary`; purple is currently underused as the Vanta-intelligence accent.
- Today's header is plain: icon + eyebrow + headline + subline, no ambient treatment, no depth separation.
- Bottom nav already has a leading indicator bar plus an icon lift with a primary drop-shadow glow.

## Step 2 — Token and surface groundwork

In `src/index.css`, add a small number of named additions (no second system):
- `--vanta-accent` alias notes for intelligence purple usage, plus `--gradient-hero` (very low-opacity purple radial) and `--noise` (inline SVG grain data URI at extremely low opacity).
- `.vanta-hero` — inset surface level with the purple radial and grain, and a slow drift that is removed under reduced motion.
- `.vanta-grain` — reusable, opt-in texture overlay for Today hero, Ask background, sheet/dialog headers only.
- `.vanta-signal` — the single 1px signal-line motif: a short one-shot sweep, event-driven, never looping.
- `.vanta-hover-lift` — desktop-only (`@media (hover: hover)`) 1px lift plus a small shadow change; mobile falls back to `.motion-press`.
- Add three surface levels of tonal depth (page → surface → inset → elevated dialog) rather than more borders.
- Every new class added to the existing reduced-motion block.

Export matching constants from `src/lib/motion.ts` (`MOTION_HOVER_LIFT`, `MOTION_SIGNAL`) so components never hand-write these strings.

## Step 3 — Today hero

Wrap the Today header in `.vanta-hero` so Vanta's presence sits there: subtle purple radial behind the headline, grain, slight depth separation from the feed. Headline copy and tone logic stay exactly as they are. Typography gets tighter tracking and a confident weight; the eyebrow stays small caps; the subline stays quiet.

## Step 4 — Ambient intelligence accent

Use `.vanta-signal` only for real events, one-shot each time:
- scoped refresh acknowledgment in the workspace switcher
- new change arriving in Today
- Ask response arrival
- newly executed receipt
- updated continuity state on a re-entry card

The accent appears once and settles. No indefinite loop anywhere.

## Step 5 — Navigation

Keep the four rooms. Sharpen the active marker: crisp accent bar with a short sweep on change, reduce the existing icon glow to a restrained emphasis rather than a drop-shadow bloom, and keep `aria-current` and 44px targets intact.

## Step 6 — Rooms get different energy, one design system

- Today: calm, hero-led, generous spacing.
- Work: more operational — stronger section dividers, crisp status rows using the existing `workLabels` output, a small active marker on moving work, quiet treatment on dormant work.
- Ask: open and spacious, grain background, less chrome.
- Receipts: factual and stable, minimal motion, one-shot arrival on a newly created receipt (quick resolve + 0.99→1 scale + accent line, no stamp graphics).

## Step 7 — State resolution and structured objects

- State changes (approve, execute, complete, dismiss, pin) use the existing crisp `.motion-resolve` / `.motion-confirm` — short, no bounce, no confetti.
- Structured Ask blocks arrive as a single container: 4–6px rise plus fade, once. No per-line animation.
- `ProcessingLine` gains a thin purple signal line alongside the existing honest dot sequence, active only while the request is pending.

## Step 8 — Colour and typography discipline

- Purple reserved for Vanta identity/intelligence: companion active state, nav marker, Ask processing, Vanta-generated structured objects, scope refresh, hero ambient. Nowhere else.
- Semantic colours unchanged: green complete, amber waiting, red failed, info blue neutral.
- Typography: tighter tracking on state headlines, compact crisp status labels, quieter metadata, all-caps only on small eyebrows and status chips.
- Sweep components for any hardcoded colour utilities found in the audit and move them to tokens.

## Step 9 — Validation

- Visual checks at 384px, tablet, desktop, wide desktop, and reduced-motion.
- Confirm scroll smoothness and no expensive blur/shadow stacks; drop any effect that costs frames on mobile.
- Keep all 146 existing tests passing; add small non-timing tests only: classes apply in the correct states, reduced motion disables movement, refresh accent clears after refetch, processing indicator stops on completion, receipt arrival applies only to new receipts, no duplicate rows from arrival animation.
- Record before/after notes in the audit doc.

## Technical notes

Files expected to change: `src/index.css`, `src/lib/motion.ts`, `src/components/surfaces/TodaySurface.tsx`, `WorkSurface.tsx`, `ConversationSurface.tsx`, the receipts/audit surface, `src/components/shell/SurfaceTabs.tsx`, `src/components/shell/WorkspaceSwitcher.tsx`, `src/components/companion/StructuredResponse.tsx`, `src/components/companion/ProcessingLine.tsx`, `src/components/continuity/ProjectReentryCard.tsx`, plus the audit doc and one test file. No backend, schema, hook-logic, navigation-architecture or scope changes.
