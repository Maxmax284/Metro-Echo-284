# Vanta Architecture Audit — Plan

You asked for the audit doc first. Below is the full audit, grounded in the actual codebase. On approval, I'll write it to `.lovable/architecture-audit.md` so it lives alongside `plan.md` and `phase*.md`. No code changes in this step — just the doc.

After approval we'll pick slices from the priority table at the bottom.

---

## Deliverable

**File:** `.lovable/architecture-audit.md` containing the audit below verbatim.

No other files touched. No DB changes. No edge function changes.

---

## Audit Content (goes into the doc)

### 1. Routes (`src/App.tsx:48-58`)


| Path                   | Component                               | Place / View                                            |
| ---------------------- | --------------------------------------- | ------------------------------------------------------- |
| `/`                    | `Index` (surface-tab shell)             | Place — the primary destination                         |
| `/projects`            | `ProjectsPage` → `ProjectsSurface`      | Place — also duplicated as a surface tab inside `/`     |
| `/projects/:id`        | `ProjectBriefPage` → `ProjectBriefView` | Place — same component used inside the shell drill-down |
| `/auth`, `/settings/*` | utility / control room                  | Place                                                   |


**Issue:** `/projects` and `/projects/:id` exist as both standalone routes and surface tabs. Two entry paths, slightly different chrome.

### 2. Surfaces (`src/components/surfaces/`, `src/pages/Index.tsx`)

Primary 5-tab nav: `command` (Cockpit) · `inbox` · `projects` · `briefs` · `receipts`.

Overflow surfaces still mounted: `schedule`, `conversation`, `memory`, `commitments`, `actions`, `sherlock`, `awareness`, `audit`.

**Duplicate keys:** `receipts` and `audit` both render `AuditSurface` (`Index.tsx:255` and `:263`). Same component, two tabs.

### 3. Hidden / orphaned surfaces

- `SherlockSurface` — duplicates the global `SherlockOverlay` (always mounted in `App.tsx:61`).
- `ConversationSurface` — duplicates `CompanionWidget` (always-on dock).
- `ScheduleSurface` — already embedded in Cockpit via `DailyBriefingCard` + `ScheduleQueryChips`.
- `AwarenessSurface` — already surfaced in Cockpit via `AwareCockpitCard`.
- `CommitmentsSurface` / `ActionsSurface` — already shown inside `ProjectBriefView` "Needs me".
- `tutorial/SystemMap.tsx`, `tutorial/FollowOneNoteDemo.tsx` — only reachable from `FirstRunWalkthrough`.

### 4. Duplicate workflows

**Attach to project — 4 mechanisms:**

- `AttachToProjectMenu` (per-row popover)
- `BulkAttachToProjectMenu` (multi-select popover, ~90% same code)
- `AddToProjectComposer` (in-project dialog)
- `ProjectInbox` (AI-suggested, one-tap)

**Linking — 2 separate graphs:**

- `cross_links` table via `src/lib/crossLinks.ts` (item↔item)
- `entity_relations` + `entity_links` via `src/lib/entityGraph.ts` (entity↔entity)
- Canvas drag-to-relate writes only to `entity_relations` (`CommandCanvas.tsx:193-233`).

**Capture / Memory — same data, two surfaces:**

- `InboxSurface` and `MemorySurface` both mount `CapturesView` and `MemoryFilesView`, each independently fetching the same rows.

### 5. Living Brief & Sherlock language

Block names are clean: *Where it stands · What moved · Who's waiting · Open questions · Next move* (`LivingBriefBlocks.tsx:93-131`).

Sherlock voice is consistently forensic and non-executing (`vantaVoice.ts:253-285`).

**Database-y phrases to swap** (`src/lib/vantaVoice.ts`):

- Line 28: `"Noted. \"${title}\" is filed."` → `"Noted. \"${title}\" is in."`
- Line 88: `"Filed away."` → `"Tucked away."`
- Line 207: `"Route recorded."` → `"Logged where it came in."`

Minor: `ProjectBriefView.tsx:358-362` uses "attached"/"filing" framing in the empty state — acceptable but could be more operational.

### 6. Export & Receipts — disconnected pipelines

- `brief_exports` has no `project_id`, only `entity_id` (`src/lib/briefs.ts:62`).
- Project Living Briefs are written to `projects.brief_structured` by `project-summarize` and never create a `brief_exports` row.
- **Result:** the Receipts/Briefs tab shows zero history for project briefs. A user generating 20 project briefs sees nothing in Briefs.

Trace:

```
ProjectBriefView → project-summarize → projects.brief_structured + audit_log("project.summarized")
BriefComposerSheet → compose-brief → brief_exports (+ PDF in storage)
```

Two pipelines, no cross-reference.

### 7. OpenCanvas

`CommandCanvas` (`src/components/entities/CommandCanvas.tsx`) hosts Cards / Timeline / Flow / Board / Graph. All views are **entity-scoped via `openCanvasSeed.seedEntityId**`.

Projects are not entities. There is no path to "open canvas for this project". No "Open canvas" button exists in `ProjectBriefView`. Canvas can't fulfil the doctrine line "OpenCanvas visualizes the project" today.

---

## Priority Table (for slicing next)


| #   | Severity | Finding                                                      | Fix shape                                                                                                |
| --- | -------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| 1   | 🔴       | `receipts` and `audit` are the same component under two keys | Remove `audit` surface key; keep `receipts`                                                              |
| 2   | 🔴       | Project briefs don't appear in Briefs/Receipts               | Add `project_id` to `brief_exports`; write a row on every `project-summarize`                            |
| 3   | 🔴       | No project history on the project page                       | Render a "Past briefs" list inside `ProjectBriefView` once #2 lands                                      |
| 4   | 🟠       | 3 near-duplicate attach popovers                             | Merge `AttachToProjectMenu` + `BulkAttachToProjectMenu` into one parameterized component                 |
| 5   | 🟠       | `InboxSurface` and `MemorySurface` overlap                   | Define the split: Inbox = pre-organized landing, Memory = search/retrospective. Remove duplicated mounts |
| 6   | 🟠       | Canvas has no project scope                                  | Add `seedProjectId` path through `CanvasContext` and an "Open canvas" button in `ProjectBriefView`       |
| 7   | 🟡       | Two link graphs (`cross_links` vs `entity_relations`)        | Document the split deliberately or plan a merge                                                          |
| 8   | 🟡       | `ConversationSurface` overflow duplicates `CompanionWidget`  | Remove overflow tab                                                                                      |
| 9   | 🟡       | `SherlockSurface` overflow duplicates `SherlockOverlay`      | Remove overflow tab                                                                                      |
| 10  | 🟡       | `"filed"` / `"Filed away"` / `"Route recorded"` in vantaSay  | Replace with operational equivalents                                                                     |
| 11  | 🟢       | Block names + Sherlock voice                                 | No change                                                                                                |


---

## Next step

Approve this plan → I write `.lovable/architecture-audit.md`. Then we pick which row(s) from the priority table become Slice 3.  
  
  
Approved.

Write `.lovable/architecture-audit.md` exactly as drafted.

No code changes yet.

No DB changes yet.

No edge function changes yet.

After the audit doc is written, proceed to planning Slice 3 from the priority table.

For Slice 3, prioritize these in order:

1. Fix duplicate Receipts/Audit surface

   - Keep Receipts.

   - Remove/demote Audit as a separate surface key.

   - Same component should not appear under two names.

2. Fix project briefs not appearing in Briefs/Receipts

   - Add project history visibility.

   - Project summaries/briefs must show up in the same saved brief/export history as other generated briefs.

   - User should not generate a project brief and then lose track of it.

3. Add Past Briefs / Saved Briefs inside ProjectBriefView

   - A project should show its own generated summaries and exports.

   - This is critical for trust and continuity.

4. Add project-scoped OpenCanvas access

   - Add “Open Canvas” inside ProjectBriefView.

   - Canvas should open for the current project, not just entity scope.

   - OpenCanvas becomes the project whiteboard.

5. Then clean language in vantaVoice

   - Replace “filed” / “filed away” / “route recorded” with more human operational language.

Do not start with attach menu refactors yet.

Do not start with link graph cleanup yet.

Do not start with Memory vs Inbox split yet.

Reason:

The biggest current problem is continuity.

If a user summarizes a project, exports a brief, or opens a project, the history needs to live where the user expects it:

inside the project, inside Briefs, and inside Receipts.

That comes before code cleanup.