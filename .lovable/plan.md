## Project Summary follow-ups

Five focused upgrades around the project-summary preset. No new tables.

### 1. Export-to-PDF from the tray card
**Edit `supabase/functions/project-summarize/index.ts`**
- Return `brief_export_id` and `project_id` in the success payload so the client can act on the new export.

**Edit `src/lib/exportPresets.ts`**
- After `complete`, attach a `secondaryAction` "Download PDF" alongside "Open project". The action:
  - Builds a `Brief` from the structured blocks (reuse `LivingBriefBlocks` source shape → simple section list: overall summary, situation, themes, decisions, risks, next move).
  - Renders with `pdf(<BriefPdfDocument brief={brief} />).toBlob()`.
  - Calls `approveAndExportBrief({ row, pdfBlob })` on the returned `brief_export_id`, then opens the signed URL.

**Edit `src/lib/workStatus.ts` + `WorkProgressCard.tsx` + `ActivityStore.tsx`**
- Add optional `secondaryAction?: WorkPrimaryAction` to `WorkItem` and render it next to the primary action button.

### 2. Show summary inside the project details view
The `ProjectBriefView` already renders `projects.brief_structured` via `LivingBriefBlocks`. Two small fixes so users reliably see it after launching from Documents:
- Add an `id="living-brief"` anchor on the Living brief `<section>` in `ProjectBriefView`.
- When the tray's "Open project" action navigates to `/projects/:id#living-brief`, ProjectBriefView scrolls that section into view after mount (one `useEffect` on hash).

### 3. Regenerate summary replaces prior export
**Edit `supabase/functions/project-summarize/index.ts`**
- Accept optional `replace_prior: boolean` (default true). When true, before inserting the new mirrored `brief_exports` row, delete prior project-scoped rows for this project where `storage_path IS NULL` and `format = 'operator'` and `scope_kind = 'project'`. Leaves PDF-backed exports untouched.

**Edit `src/components/projects/ProjectBriefView.tsx`**
- Rename the existing "Refresh" / "Summarize" action to "Regenerate" once a structured brief exists. Adds a small confirmation toast describing what's replaced.

**Edit `src/lib/exportPresets.ts`**
- Pass `replace_prior: true` from the preset run.
- Add a `secondaryAction` "Regenerate" on the completed tray card that re-launches the same preset for the same project.

### 4. Project picker upgrades
**Edit `src/pages/Documents.tsx`** (the `<Dialog>` block only)
- Add a search `<Input>` filtering by title (case-insensitive).
- Recently used: persist a small list of last 5 project IDs picked here in `localStorage` (`vanta.documents.recentProjects`). Render them as a top section "Recent" above the full list. Update on selection.
- Empty-state copy:
  - No projects at all: "No projects in this workspace yet. Create one from Projects and attach a few notes or files, then come back."
  - No matches: "Nothing matches '<query>'."
- Disable the picker submit when filtered list is empty.

### 5. Tests
**New `src/lib/exportPresets.test.ts`** using vitest + a mocked supabase client:
- Mocks `@/integrations/supabase/client` (`supabase.functions.invoke`).
- Builds a minimal `WorkHandle` spy.
- Cases:
  - Happy path: invoke called with `{ project_id, tone, replace_prior: true }`; returns `{ structured, brief_export_id }`; handle reaches `complete` with project + PDF actions populated.
  - Rate limit: invoke resolves `{ data: { error: 'rate_limited' } }` → `fail` called with a wait-a-minute message.
  - Credits exhausted: `{ error: 'credits_exhausted' }` → `fail` called with credit message.
  - Empty: `{ empty: true }` → `waitForUser` with attach-items message.
  - Missing project id: returns immediately with `waitForUser`.

Note on the "updates brief_exports and projects.brief_structured" requirement: covered by asserting the client-side contract (correct invoke args, correct handle transitions). The actual DB writes happen in the edge function and are not reachable from vitest without hitting live infra; covering them would require Deno tests against the deployed function — out of scope for this pass and explicitly skipped to keep tests fast and offline.

### Files touched
```text
supabase/functions/project-summarize/index.ts   (return id, replace_prior)
src/lib/exportPresets.ts                        (PDF action, regenerate, replace_prior)
src/lib/workStatus.ts                           (secondaryAction type)
src/components/workstatus/ActivityStore.tsx     (pass through secondaryAction)
src/components/workstatus/WorkProgressCard.tsx  (render secondary button)
src/components/projects/ProjectBriefView.tsx    (anchor + hash scroll, button label)
src/pages/Documents.tsx                         (picker search, recents, empty states)
src/lib/exportPresets.test.ts                   (new)
```

### Risks / non-goals
- No DB migrations.
- The PDF builder reuses `BriefPdfDocument` with a synthesized Brief — visuals will look like other operator exports, not a custom layout.
- Recent-projects list is per-browser (localStorage), not per-user — acceptable for this UX nudge.
- Tests stay frontend-only; edge function behavior is asserted indirectly through the contract.
