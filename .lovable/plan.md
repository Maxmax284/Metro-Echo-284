
# Vanta Document Engine + Work Status Layer — Foundation Pass

## Goal

Make Vanta show its work and turn existing memory into clean documents. Foundation only — no parallel "Document Engine World", no new tables, no new AI calls, no new routes.

## Audit findings (what already exists, what we extend)

- **Documents Beta**: `src/pages/Documents.tsx`, `src/components/documents/*`, `src/lib/documents.ts`, `documentExport.ts`, `documentDocxExport.ts`, `documentDraftExport.ts`, `documentTemplates.ts`. Real PDF/DOCX export already works. Reuse all of it.
- **Plain language helpers**: `src/lib/plainLabels.ts` (with banned-token scrub), `bulletinLanguage.ts`. Extend, don't replace.
- **Toasts**: `sonner` everywhere.
- **Motion**: CSS variables already in `src/index.css` from last pass. No framer-motion. Stay with CSS.
- **Inbox attach**: `src/components/projects/AttachToProjectMenu.tsx` uses sonner toasts.
- **Cockpit**: `DailyBulletinCard`, `DailyChecklistCard`, `ProjectRollupCards` etc.
- **No durable job table exists.** Per the prompt's hard rule, we do NOT add a migration. The Activity Tray uses an in-memory store (Zustand-style with React context) that persists only for the session. Receipts/exports already write durable rows where it matters — the tray is a visibility layer on top, not a new source of truth.

## What we'll build

### 1. Work Status core (no UI yet) — `src/lib/workStatus.ts`

- `WorkState` type: `queued | working | waiting_for_user | complete | failed | canceled`
- `WorkItem` type: `{ id, kind, title, projectName?, steps: string[], currentStep, state, destination?, error?, primaryAction?, startedAt, finishedAt? }`
- `humanizeWorkState()`, `humanizeWorkStep()`, `humanizeActionResult()`, `humanizeWorkError()` — route through `plainLabels.scrubBannedTokens()`.
- Standard step libraries from the prompt (export, upload, attach, project update, receipt packet, dismiss) as exported constants.

### 2. Activity Tray store — `src/components/workstatus/ActivityStore.tsx`

React context + reducer. API:
```ts
const { start, advance, complete, fail, waitForUser, cancel, items } = useActivity();
const handle = start({ kind, title, steps, projectName });
handle.advance(stepIndex);
handle.complete({ destination, primaryAction });
handle.fail({ message, retry });
```
Mounted once in `App.tsx`. Items auto-move to "recent" after 8s on complete, stay until dismissed on failed/waiting.

### 3. Reusable primitives — `src/components/workstatus/`

- `ActionButton.tsx` — thin wrapper over existing `Button`. Takes `pending`, `pendingLabel`. Shows label swap + tiny inline spinner under 700ms, then escalates.
- `WorkProgressCard.tsx` — compact inline card: title, current step text, "Step N of M", calm `--motion-base` fade-in.
- `StepTicker.tsx` — dots row, no infinite pulse, single CSS transition on active dot.
- `WorkStatusBadge.tsx` — colored pill mapped from `WorkState` via `humanizeWorkState`. Uses semantic tokens.
- `ActivityTray.tsx` — bottom-right desktop, bottom pill (above bottom nav) on mobile. Collapsed = "N active" pill. Expanded = grouped sheet (Working / Needs you / Recently done / Failed). Does not steal focus.

Reuses existing shadcn `Sheet`, `Card`, `Button`, `Badge`. No new deps.

### 4. Document Engine preset registry — `src/lib/exportPresets.ts`

Single declarative registry, no DB. Initial presets:

- `daily-command-brief` → reuses existing brief composer + `documentExport` PDF pipeline.
- `project-summary-report` → reuses existing project data + `documentExport`.
- `receipt-capture-packet` → reuses existing receipts/capture data + `documentExport`.

Each preset shape: `{ id, label, outputFormat, dataSources, sections, defaultDestination, steps[], successCopy, failureCopy }`.

Exposes one function: `runExportPreset(presetId, context, activity)` — orchestrates `start → advance per step → complete with destination` using the Activity store, and calls the actual existing export functions. If a preset's real generator isn't wired, it calls `waitForUser` with a clear "Not available yet" state instead of faking completion.

### 5. Wire into existing flows (no rebuilds)

- **`AttachToProjectMenu.tsx`** — replace bare sonner calls with Activity start/complete/fail using the "Inbox attach" step library. Toast still fires on completion (single, not spam).
- **`Documents.tsx`** — add a small "Active document work" row at the top driven by `useActivity()` filtered to `kind: 'document'`. Add a "Create…" menu that calls `runExportPreset` for the three presets. Document cards keep existing actions; add `WorkStatusBadge` when an item has an in-flight job.
- **`DailyBulletinCard.tsx`** — add a slim "Active work" row only when something is running (one line, dismissible, no looping motion). Stays quiet otherwise.
- **`App.tsx`** — mount `<ActivityProvider>` + `<ActivityTray />` once.

### 6. Language audit pass

Extend `plainLabels.BANNED_TOKENS` with the prompt's full banned list (`lifecycle state`, `artifact composed`, `export artifact`, `render initialized`, `briefing.composed`, `processing`, etc.) and run a repo grep to fix any remaining raw strings in user-visible code.

### 7. Motion & a11y

- Reuse existing `--motion-fast/base/slow` vars. No new keyframes that loop.
- Wrap all transitions in `@media (prefers-reduced-motion: reduce)` → instant.
- All tray/card buttons ≥44px. Tray pill positioned above bottom nav at 384px.
- `role="status"` + `aria-live="polite"` on the active work region.

## Out of scope (explicit)

- No new Supabase migrations, no new tables, no new edge functions.
- No new AI calls.
- No new routes.
- No template builder, no Canva editor, no Contract Intelligence work.
- Python/ReportLab worker is NOT added — interface designed so it could plug in later.

## File touch list

New:
- `src/lib/workStatus.ts`
- `src/lib/exportPresets.ts`
- `src/components/workstatus/ActivityStore.tsx`
- `src/components/workstatus/ActionButton.tsx`
- `src/components/workstatus/WorkProgressCard.tsx`
- `src/components/workstatus/StepTicker.tsx`
- `src/components/workstatus/WorkStatusBadge.tsx`
- `src/components/workstatus/ActivityTray.tsx`

Edited:
- `src/App.tsx` (mount provider + tray)
- `src/lib/plainLabels.ts` (extend banned list + work helpers)
- `src/components/projects/AttachToProjectMenu.tsx` (wire activity)
- `src/pages/Documents.tsx` (active work row, preset launcher, badges)
- `src/components/cockpit/DailyBulletinCard.tsx` (slim active work row)
- `src/index.css` (only if a missing motion var needs adding)

## Risks / things to call out before building

1. **No durable job persistence.** If you navigate away and refresh, in-flight tray items vanish. Anything that mattered (exports, receipts) is still safely stored by the existing pipelines. If you want refresh-safe tray history later, that needs a `work_jobs` table — flagged for a separate approval.
2. **Daily Bulletin** already had a calm pass last round. The "Active work" row will only render when `items.filter(working).length > 0` so it stays quiet by default.
3. **Documents page** currently has its own loading states. We'll layer the new primitives on top without removing existing behavior; if anything double-renders we'll consolidate in the same edit.

Ready to build on approval.
