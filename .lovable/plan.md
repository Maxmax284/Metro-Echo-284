
# Step 2 — Inbox surface

Goal: turn the current Memory tab maze into one **Inbox** that feels like "stuff lands here, then I push it to a project."

## What we're building

A new `src/components/surfaces/InboxSurface.tsx` that the `inbox` surface key renders (replacing the current `MemorySurface` placeholder). It **composes existing pieces** — no rebuilds.

### Layout

```text
┌────────────────────────────────────────────────────┐
│  Inbox                                  [+ Note]   │
│  Stuff lands here. Push it into a project.         │
│                                                    │
│  [ Captures ] [ Notes ] [ Files ]   ◐ selecting    │
│                                                    │
│  ▣ ── capture / note / file row ─── [Attach ▾]    │
│  ▣ ── capture / note / file row ─── [Attach ▾]    │
│  □ ── capture / note / file row ─── [Attach ▾]    │
│                                                    │
│  Sources: Telegram · Email · Voice · Upload  (▸)   │
└────────────────────────────────────────────────────┘
   ↑ when ≥1 selected, sticky bar appears:
   ┌────────────────────────────────────────────────┐
   │  3 selected   [Attach to project ▾]  [Clear]   │
   └────────────────────────────────────────────────┘
```

### Three subtabs

1. **Captures** — existing `CapturesView` (already has multi-select + bulk connect, already has per-row `AttachToProjectMenu`). We pass an `onSelectionChange` callback so the Inbox-level sticky bar can drive bulk-attach.
2. **Notes** — extract the notes list from `MemorySurface` into `InboxNotesList.tsx`. Each row gets a checkbox + per-row `AttachToProjectMenu`. Tapping a row still opens the editor (reuse the editor block from `MemorySurface`).
3. **Files** — existing `MemoryFilesView` with per-row attach already present; add checkbox column.

A single `useInboxSelection()` hook holds `{ kind, id, label }[]` across subtabs so a selection survives tab switches.

### Bulk action bar

Sticky bar appears when selection > 0:

- **"Attach to project"** — opens a slimmed project picker (reuse `AttachToProjectMenu`'s internal list logic via a new `BulkAttachToProjectMenu`). On confirm: writes one `project_items` row per selected item using existing `attachItemsToProject(projectId, items[])` helper in `src/lib/projects.ts` (add if missing — current helper attaches one at a time; we'll add a batched version).
- **"Clear"** — empties selection.

Each successful bulk-attach writes a single audit event `inbox.bulk_attached` with the project id + item count, and shows a toast "3 items pushed to Lamai Q3 rollout — open project?"

### Sources strip (collapsed by default)

A bottom row with chips for Telegram / Email / Voice / Upload. Tap a chip → opens the existing settings sheet for that source. This replaces the random source cards floating around the old Memory surface.

## File touches

**New:**
- `src/components/surfaces/InboxSurface.tsx` — the surface shell with the three subtabs, header, sticky bulk bar.
- `src/components/inbox/InboxNotesList.tsx` — notes list + checkboxes + per-row attach (extracted from MemorySurface).
- `src/components/inbox/useInboxSelection.ts` — tiny zustand-free hook (useState + context or just module-level store) for cross-tab selection.
- `src/components/projects/BulkAttachToProjectMenu.tsx` — popover, search projects, "Create new" inline, calls batched attach.

**Edited:**
- `src/lib/projects.ts` — add `attachItemsToProject(projectId, items: { item_type, item_id }[])` that does a single `insert([...])` and writes one audit event.
- `src/components/memory/CapturesView.tsx` — accept optional `selection`/`onSelectionChange` props that mirror its existing internal selection to the parent (it already has multi-select for connect — we just expose it).
- `src/components/memory/MemoryFilesView.tsx` — add an optional `selection`/`onSelectionChange` to surface its row checkbox state to the parent.
- `src/pages/Index.tsx` — `surface === "inbox"` now renders `<InboxSurface />` instead of `<MemorySurface />`. Old `memory` key still renders `MemorySurface` via the More sheet (keeps deep links working).

## What we're NOT doing in this step

- Not touching the notes editor itself (still launched from the notes row).
- Not adding bulk **Summarize** yet — that lands in Step 3 inside the Project view so the brief has a project to live under.
- Not changing source ingestion code or Telegram bridge.
- No DB migration. `project_items` already supports multi-insert.

## Acceptance

1. Tap **Inbox** in the rail → see Captures / Notes / Files subtabs.
2. Tick 3 rows across two subtabs → sticky bar shows "3 selected".
3. Tap **Attach to project** → pick "Lamai Q3 rollout" → toast confirms, items appear in that project's Living Brief, one audit event written.
4. Per-row **Attach** still works for single items.
5. Old `/projects/:id` page and notes editor unchanged.

## Order of implementation

1. Add `attachItemsToProject` batched helper + `useInboxSelection` hook.
2. Build `BulkAttachToProjectMenu`.
3. Build `InboxSurface` shell with the three subtabs.
4. Wire selection passthrough into `CapturesView` and `MemoryFilesView`.
5. Extract `InboxNotesList` from `MemorySurface`.
6. Swap `surface === "inbox"` in `Index.tsx`.

Should take one pass. Ready to build?
