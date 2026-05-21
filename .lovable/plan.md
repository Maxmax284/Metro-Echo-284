# Phase 3 — Sherlock Surface-Wide Recognition

## Goal

Sherlock stops being a buried feature and becomes visible, useful, and trustworthy across every surface. The five operations — Observe, Extract, Relate, Suggest, Investigate — are explicit, confidence-labeled, and never execute without approval.

## What exists already

- Edge function: `sherlock-investigate` supports `overlay`, `extract`, `suggest`, and `full` modes with caching via `sherlock_findings_cache`
- Tables: `investigations`, `investigation_findings`, `sherlock_findings_cache`
- UI: `AnalyzeButton`, `SherlockOverlay` (sheet), `SherlockSurface` (dedicated page), `SherlockContext`
- Voice: `vantaSay.sherlock.*` phrases already in place
- Status dots: confidence tones already mapped

## What's missing / what this phase builds

### 1. Complete the 5-operation model in the edge function

Add `observe` (lightweight read) and `relate` (find connections across substrate) modes to `sherlock-investigate`:

- `observe`: lightweight scan — what type of thing is this, what's salient, no deep analysis. Returns: `kind`, `salient`, `confidence`. Cached.
- `relate`: given an entity, find related notes/commitments/actions across the substrate. Returns: `related` array with `kind`, `id`, `why`, `confidence`. Cached.

`extract` and `suggest` already exist but their results are only cached, never surfaced on cards.

### 2. Surface Sherlock chips on cards across the platform

Wherever an item has cached Sherlock findings, show a dismissible confidence chip:

| Surface | Card | What Sherlock shows |
|---------|------|---------------------|
| Memory / Capture Inbox | `CaptureCard` | `suggest` result: route chip ("→ Commitment", "→ Action") with confidence dot |
| Memory / Files | `MemoryFilesView` file rows | `extract` result: detected type chip with confidence |
| Commitments | commitment cards | `relate` result: N related items found |
| Actions | action cards | `relate` result: N related items found |
| Notes | note cards | `relate` result: N related items found |
| Briefings | `DailyBriefingCard` | `observe` on briefing content — salient insight chip |
| Canvas | entity cards | `relate` — linked entities count |
| Telegram | (deferred to Phase 8) | — |

Each chip is dismissible (sets `dismissed_at` in cache or local state). Tapping a chip opens the Sherlock overlay pre-filled with that operation's results.

### 3. Confidence-visible suggestions only

Every Sherlock-derived chip, badge, or inline suggestion must show:
- Confidence level (`high` / `medium` / `low`) via `StatusDot` tone
- The operation that produced it (`observe`, `extract`, `relate`, `suggest`, `investigate`)
- A "Suggestion — tap to review" hint on first render

### 4. "Nothing runs until you approve" wiring

- `Suggest` mode currently proposes routes (memory/commitment/reminder/action/sherlock/ignore). These must surface as **draft chips** on the card, not auto-route.
- Tapping a suggestion chip opens the Sherlock overlay with an explicit "Approve" / "Dismiss" action.
- Approve → routes the item, writes `audit_log` event.
- Dismiss → marks dismissed, writes `audit_log` event.
- All suggestion chips render `vantaSay.sherlock.notExecuting()` as micro-copy.

### 5. Sherlock overlay operation selector

Currently the overlay only runs `investigate` (deep analysis). Extend it to allow switching between the 5 operations when opened manually:

- Observe — quick type read
- Extract — structured facts
- Relate — cross-substrate connections
- Suggest — triage draft
- Investigate — deep analysis (current behavior)

Default operation depends on context: captures default to `suggest`, files to `extract`, existing entities to `relate`, freeform to `investigate`.

## Files expected to change

- `supabase/functions/sherlock-investigate/index.ts` — add `observe` and `relate` modes
- `src/components/sherlock/SherlockContext.tsx` — add `operation` to scope, extend types
- `src/components/sherlock/SherlockOverlay.tsx` — operation selector, explicit approve/dismiss actions
- `src/components/sherlock/AnalyzeButton.tsx` — pass default operation
- `src/components/memory/CaptureCard.tsx` — show `suggest` chips
- `src/components/memory/CapturesView.tsx` — wire suggest chips to cache
- `src/components/memory/MemoryFilesView.tsx` — show `extract` chips
- `src/components/schedule/DailyBriefingCard.tsx` — show `observe` chips
- `src/components/entities/CanvasCardsView.tsx` — show `relate` chips
- `src/components/entities/EntityDetailSheet.tsx` — Sherlock section with operations
- `src/lib/vantaVoice.ts` — extend `sherlock.*` phrases for observe/relate/approve/dismiss
- New: `src/components/sherlock/SherlockSuggestionChip.tsx` — reusable chip component
- New: `src/hooks/useSherlockCache.ts` — read from `sherlock_findings_cache` with stale logic

## Out of scope

- No new database tables (uses existing `sherlock_findings_cache`, `investigations`, `investigation_findings`)
- No changes to `full` investigation mode (legacy, stays as-is)
- No Telegram surfacing (Phase 8)
- No WhatsApp
- No auto-execution — all suggestions remain drafts

## Acceptance criteria

- Every major card type can show a Sherlock-derived chip when cache has findings
- All chips show confidence via `StatusDot`
- All suggestions are explicitly dismissible and approvable
- `audit_log` gets an event on every approve/dismiss
- Voice stays Vanta-native throughout (`vantaSay.sherlock.*`)
- Mobile-first: chips don't break 384px layout

## Deferred to later phases

- Phase 4: Inbox state machine integration with suggest chips
- Phase 5: Relationship graph using `relate` data
- Phase 6: Briefing variants that leverage `observe`
- Phase 7: Canvas graph filters using `relate` connections
- Phase 8: Telegram suggestion surfacing

Street version: Sherlock becomes a visible co-pilot on every card, not a hidden tool you have to remember to open.