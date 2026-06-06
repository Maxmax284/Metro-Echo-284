
This is a large multi-feature push on Command Center. I'll also quietly fix the conditional-`useMemo` hook crash in `ProjectRollupCards.tsx` while I'm in there.

## 1. Receipts drill-down on every brief claim
- Extend `compose-brief` edge function: every `BriefSection` body item gains an optional `receipts: BriefGrounding[]` field; LLM prompt requires citing source ids (audit event, note, file, commitment, action) for each claim.
- `BriefRenderer`: render a small `[receipts]` chip next to each claim. Tap → opens new `ReceiptsDrawer` listing audit events / notes / files with timestamp + "open" links into existing surfaces.
- `BriefPdfDocument`: render receipt ids inline as superscript references + an appendix table.
- New shared helper `src/lib/receiptResolve.ts` to resolve `{kind,id}` → label + route.

## 2. Whole-system scope (consolidated operational briefing)
- `BriefComposerSheet` already has "Whole system" scope; wire it through `compose-brief` so when `scope_kind=system` the function pulls rollups for all pinned projects + recent activity across entities and assembles a single consolidated brief.
- Add `system_rollup()` RPC mirroring `entity_rollup` but aggregating across the user's pinned/active entities.
- New header card in `CommandCenterSurface`: "Generate system briefing" using the new scope.

## 3. One-tap Weekly Review
- New `WeeklyReviewButton` on `CommandCenterSurface`.
- Calls `composeBrief({format:'weekly_review', scope_kind:'system', range_days:7})`, auto-runs PDF export (client format), and writes audit `brief.exported` + `weekly_review.generated`.
- Adds `weekly_review.generated` event to humanizer.

## 4. Pre-export sensitivity gate
- New `src/lib/briefSensitivity.ts`: runs `detectSensitive` (already in `_shared/sensitive.ts`, mirror as client lib) against draft brief text + linked file/note titles.
- `BriefComposerSheet`: between Draft and Approve, if any sensitive items found, show a `SensitivityReviewStep` listing categories + items, requiring an explicit "I've reviewed, export anyway" checkbox per format. Logs `brief.sensitivity_reviewed` audit.

## 5. "Let's follow one note" replayable demo
- Extend `GroundStayDemoFlow` (or new `FollowOneNoteDemo.tsx` since GroundStay variant isn't currently wired): 8 steps — capture → toast → memory inbox → connect to project → project rollup card → operational briefing → create brief → export → receipts drawer.
- Each step targets real DOM via `data-tour` attributes (add where missing).
- Replay from Settings → "Replay guided demo".

## 6. Daily checklist
- New `DailyChecklistCard.tsx` on top of `CommandCenterSurface`.
- Three sections derived from existing rollups + commitments/actions queries:
  - **Needs you**: overdue commitments, high-risk pending actions, pending sherlock findings
  - **What changed**: audit events in last 24h grouped by entity
  - **Suggested next**: top 3 from `projectHealth.urgencyRank`
- Items are tappable, route to the right surface, dismissable for the day (localStorage).

## 7. Plain-English Receipts/Audit relabel
- Expand `src/lib/plainLabels.ts` `humanize()` to cover every event currently emitted (audit_log greps).
- Audit `AuditSurface.tsx`: each row shows "[what] · [when relative + absolute] · [why this matters]" with a tooltip explaining trust ("Recorded automatically when …").
- Add `EventTrustNote` component (a one-line "why trust this" caption per event family).

## 8. Empty states
- `ProjectRollupCards`: when none → "No projects yet. Capture a note and connect it to a project to see it here."
- `BriefExportsList`: when empty → "No exports yet. Drafts stay private until you tap Approve & export."
- `LinkedChipsBar`/`LinkChips`: when empty on an item → "Not connected yet. Tap Connect to link this to a project, person, or place."
- `DailyChecklistCard`: empty per-section copy.
- Each empty state has a primary CTA button routing to the right surface.

## Bug fix (quiet)
- `ProjectRollupCards.tsx:141` calls `useMemo` after conditional early returns. Refactor so all hooks run unconditionally at the top.

## Technical notes
- Migration: add `system_rollup(_user_id uuid)` SECURITY DEFINER RPC + grants. No schema changes; reuses `brief_exports`, `audit_log`, `cross_links`, `entities`.
- Edge function `compose-brief`: extend prompt + response schema (receipts on each item, system scope path). Backwards-compatible.
- No new tables, no new buckets, no new secrets. All within Lovable Cloud.
- Doctrine kept: nothing auto-exports, every export still requires user tap; sensitivity gate strengthens that.

## Files (high level)
**New**
- `src/components/cockpit/DailyChecklistCard.tsx`
- `src/components/briefs/ReceiptsDrawer.tsx`
- `src/components/briefs/SensitivityReviewStep.tsx`
- `src/components/tutorial/FollowOneNoteDemo.tsx`
- `src/lib/receiptResolve.ts`
- `src/lib/briefSensitivity.ts`
- `src/lib/sherlock/sensitive.ts` already exists — reuse
- migration: `system_rollup` RPC

**Edited**
- `supabase/functions/compose-brief/index.ts` (receipts + system scope)
- `src/lib/briefs.ts` (types: receipts on sections, system rollup helper)
- `src/components/briefs/BriefComposerSheet.tsx` (sensitivity gate, weekly-review one-tap)
- `src/components/briefs/BriefRenderer.tsx` + `BriefPdfDocument.tsx` (receipt chips + appendix)
- `src/components/surfaces/CommandCenterSurface.tsx` (DailyChecklist, WeeklyReview button, system briefing)
- `src/components/surfaces/AuditSurface.tsx` (plain English rows)
- `src/lib/plainLabels.ts` (event coverage)
- `src/components/cockpit/ProjectRollupCards.tsx` (hook fix + empty state)
- `src/components/briefs/BriefExportsList.tsx` (empty state)
- `src/components/links/LinkedChipsBar.tsx`, `LinkChips.tsx` (empty states)
- `src/pages/Settings.tsx` (replay demo button)

## Out of scope
- No real TTS (keeps browser SpeechSynthesis).
- No new auth, no role changes.
- No removal of existing surfaces.

## Acceptance
- Every brief item shows a `[receipts]` chip that opens a drawer of real audit events/notes/files.
- "Whole system" produces a single consolidated brief covering all pinned entities.
- Weekly Review button generates + exports PDF in one tap, after sensitivity gate.
- Sensitivity gate blocks export until user explicitly confirms when sensitive content detected.
- Settings → Replay demo plays an end-to-end "follow one note" tour.
- Command Center top shows daily checklist with Needs you / What changed / Suggested next.
- Audit rows read like English sentences, not event keys.
- Empty rollups, exports, and link bars all show guidance + a CTA.
- `ProjectRollupCards` no longer crashes with the hooks error.
