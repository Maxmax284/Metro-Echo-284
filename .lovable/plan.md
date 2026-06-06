# Vanta Unified Operations Flow — Implementation Plan

This plan executes the audit you uploaded. The architecture stays as-is. We only change navigation, labels, surface roles, and a few glue components so Vanta feels like **one daily desk**, not 9 tabs.

---

## Current state (1-line audit)

You already have all the engines (Capture, Memory, Notes, Files, Sherlock, Commitments, Actions, Audit, Briefs, Projects/Living Brief). They're surfaced as **9 sibling tabs of equal weight** in `SurfaceTabs.tsx`. That's the whole problem.

## Target mental model

```text
Capture (any source) → Inbox → Project / Living Brief → Cockpit → Brief/PDF → Receipts
```

Five primary surfaces. Everything else becomes a **support layer** that lives inside one of them.


| Today's tab    | Becomes                                               |
| -------------- | ----------------------------------------------------- |
| Capture (chat) | **Inbox** (primary) — unified intake                  |
| Memory         | folded into Inbox + Projects (notes/files = sections) |
| Commitments    | section inside Project + Cockpit                      |
| Actions        | section inside Project + Cockpit                      |
| Sherlock       | "Signals" section inside Project + Cockpit            |
| Awareness      | demoted to header chip (already half-there)           |
| Audit          | renamed **Receipts** (primary)                        |
| Schedule/Today | merged into Cockpit "Today" strip                     |
| Cockpit        | **Cockpit** (primary, home)                           |
| Projects       | **Projects** (primary)                                |
| Briefs/exports | **Briefs** (primary)                                  |


---

## Scope of this pass

Five focused steps. No new engines. No schema changes (the existing `projects`, `project_links`, `briefs`, `audit_events`, `sherlock_findings` tables cover everything).

### Step 1 — Collapse navigation to 5 primary surfaces

- Rewrite `src/components/shell/SurfaceTabs.tsx`:
  - Primary rail + bottom bar: **Cockpit, Inbox, Projects, Briefs, Receipts**.
  - Move Commitments, Actions, Sherlock, Awareness, Conversation into the "More" overflow sheet, labelled "Advanced surfaces — these live inside Projects & Cockpit too."
- Add `SurfaceKey` entries: `inbox`, `projects`, `briefs`, `receipts`. Keep old keys functional for deep links.
- Default landing surface stays Cockpit.

### Step 2 — Inbox surface (rename + reframe, no rebuild)

- New `src/components/surfaces/InboxSurface.tsx` that **composes existing pieces**:
  - `CapturesView` (already exists) as the main feed.
  - `MemoryFilesView` as a "Files" tab inside Inbox.
  - Notes list (extract from `MemorySurface`) as a "Notes" tab.
  - Telegram/email/voice cards collapse into a single "Sources" chip row.
- Every row already has `AttachToProjectMenu` — promote it to a primary button labelled **"Attach to project"** with hover hint "Send this into a project's Living Brief."
- Add multi-select toolbar (checkbox per row) → bulk **Attach to project** + bulk **Summarize together** (calls existing `compose-brief` edge function scoped to selected items).

### Step 3 — Projects = the real workspace

- `ProjectBrief.tsx` already exists. Restructure it into the canonical Living Brief layout from the audit:
  1. Header: name, status, "Create brief" + "Attach items" buttons.
  2. **Recent changes** (audit_events filtered by project) — top.
  3. **What needs me** (open commitments + staged actions).
  4. **Signals** (Sherlock findings linked to project).
  5. **Notes / Files / Captures** tabs (project_links filtered).
  6. **Saved exports** (briefs).
  7. **Receipts** drawer link.
- Each section has the same affordance: select → Attach more / Summarize / Export.

### Step 4 — Cockpit = "Here is what is going on today"

- Edit `CommandCenterSurface.tsx`: keep the sticky Today + Live Briefing you just pinned. Add a **project rollup** that reads:
  > "Ground Stay needs attention · CampCore waiting on review · 3 commitments overdue · 1 export yesterday"
- Driven by existing `ProjectRollupCards` + `useProductivityPulse`. No new data.
- Demote tiles that duplicate Inbox/Projects — collapse into one "Jump to…" row.

### Step 5 — Briefs + Receipts as first-class

- **Briefs surface**: thin wrapper around existing `BriefComposerSheet` + `BriefExportsList`. Entry point: "Create brief" from any Project or selection.
- **Receipts surface**: rename Audit. Same data. Add **"Why am I seeing this?"** popover on Project/Cockpit cards that opens the receipt drawer pre-filtered to that object's `audit_events` + `project_links`.

### Step 6 — Plain-English layer

- New `src/lib/glossary.ts` mapping internal labels → plain English (already partially in `plainLabels.ts` — extend it).
- Add `<WhatIsThis term="…">` tooltip component (reuse `src/components/tutorial/WhatIsThis.tsx`) next to every ambiguous label: "Living Brief", "Signals", "Receipts", "Attach to project", "Compose brief".
- Purge surface-visible tech terms: RPC, entity_rollup, cross_links, embeddings, source_grounding.

---

## What we are NOT doing this pass

- No DB migrations. No new engines. No AI prompt rewrites.
- Not deleting Commitments / Actions / Sherlock / Awareness surfaces — they remain reachable via overflow + deep links so muscle memory and existing notification routes (`/?commitment=…`) still work.
- No mobile redesign beyond keeping 384px tap targets honest in the new bottom bar.
- No changes to capture pipelines, Telegram bridge, or Sherlock logic.

---

## Implementation order

1. SurfaceTabs collapse + new route keys (Step 1) — unblocks everything else.
2. Inbox surface composition (Step 2).
3. Project/Living Brief restructure (Step 3).
4. Cockpit project rollup tightening (Step 4).
5. Briefs + Receipts wrappers + "Why am I seeing this?" (Step 5).
6. Glossary tooltip sweep (Step 6).

Each step is shippable on its own and leaves the app in a working state.

---

## Acceptance check (from your audit doc)

After this pass, you should be able to:

1. Capture → see it land in **Inbox**.
2. Multi-select 3 captures → **Attach to project** → they appear in the Living Brief.
3. Open the project → see Recent changes, Needs me, Signals, Notes/Files, Exports, Receipts.
4. Tap **Summarize** → brief appears under Saved exports + surfaces in Cockpit.
5. Open Cockpit → one screen tells you what changed and what needs you.
6. Tap **Why am I seeing this?** on any card → receipts drawer explains it.

If any of those break, the step that owns it gets revisited before moving on.

---

Want me to start with Step 1 (collapse nav to the 5 primaries) or jump straight to Step 3 (Project/Living Brief restructure) since that's where most of the daily-flow pain lives?  
  
Start with Step 1: collapse navigation to the 5 primary surfaces.

Proceed in the proposed order.

Do not jump to the Project/Living Brief restructure yet.

Reason:  
The navigation is the first source of confusion. If the app still presents 9 sibling tabs of equal weight, the user will continue feeling lost even after the Project page improves.

Approved direction:

Primary surfaces:

- Cockpit
- Inbox
- Projects
- Briefs
- Receipts

Move the old advanced surfaces into More:

- Commitments
- Actions
- Sherlock
- Awareness
- Conversation
- any legacy/deep-link-only surfaces

Keep old deep links functional.

Default landing surface remains Cockpit.

Make the “More” sheet clearly explain:  
“Advanced surfaces — these also live inside Projects and Cockpit.”

After Step 1 is complete and reviewed, proceed to Step 2: Inbox surface composition.