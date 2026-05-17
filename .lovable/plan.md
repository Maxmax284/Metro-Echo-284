# Stage 2 — Companion Toolbelt (attach · voice · slash)

Goal: turn the Companion composer into a real toolbelt where **every action is declared in `companionTools.ts`** and surfaced through three input affordances — paperclip (attach), mic (voice), and `/` (slash palette). No new tables, no new edge functions, no new providers.

## Scope (only this)
- Attach button → reuses existing `files-ingest` pipeline, then auto-runs the `analyze-file` registry tool.
- Voice button → keep existing Web Speech mic; promote it from inside `ConversationSurface` so it lives on the dock for every consumer.
- Slash palette → typing `/` opens a registry-driven command menu (filtered by surface/mode/owner/API kill-switches via `getToolAvailability`).
- Registry stays the single source of truth. No hardcoded action lists in the dock.

Out of scope (later stages): Conversation tab demotion, Awareness HUD, Sherlock surface rebuild, Memory filters, Street Signals.

## Files

**Edit `src/components/shell/ConversationDock.tsx`**
- Add props: `onAttach?: (files: FileList) => void | Promise<void>`, `onSlashPick?: (toolId: string) => void`, `surface: string`, `mode: AppMode`, `isOwner: boolean | null`, `controls: SystemControls | null`.
- Add a paperclip button left of the mic; hidden file input; calls `onAttach`.
- Detect leading `/` in textarea → render a popover above the dock listing available tools (filter via `getToolAvailability`). ↑/↓/Enter to pick; Esc closes. Picking a tool calls `onSlashPick(tool.id)` and clears the input.
- Tools with `directAction` execute directly (open Sherlock / Research). Prompt-style tools call `buildPrompt({ surface, placeLabel })` and submit via existing `onSend`.
- Keep current behavior: Enter submits, Shift+Enter newline, mic transcribes.

**Edit `src/components/surfaces/ConversationSurface.tsx`**
- Remove the standalone `<CompanionTools>` chip strip (slash palette replaces it).
- Pass new props to `ConversationDock`: surface/mode/owner/controls, plus
  - `onAttach`: uploads to `memory-uploads` storage + inserts `ingested_files` + invokes `files-ingest` (reuse logic from `FileUploadCard`), then auto-sends the `analyze-file` registry prompt.
  - `onSlashPick(toolId)`: looks tool up in `COMPANION_TOOLS`; if `directAction === "open-sherlock"` → `openSherlock(...)`; if `"open-research"` → set local `researchOpen=true`; else `send(tool.buildPrompt({ surface, placeLabel }))`.
- Add a lightweight Research sheet (`<Sheet>` wrapping the existing `ResearchPanel`) opened by the registry's `research-this` tool. No new component logic — just mount existing panel.

**Edit `src/components/companion/CompanionWidget.tsx`**
- No structural change; `ConversationSurface` already gets the wiring. Verify the widget's surface context still feeds the dock correctly (it does via `CurrentContextProvider`).

**No edits to:** `companionTools.ts`, `apiGuard.ts`, edge functions, DB, `CompanionTools.tsx` (kept as fallback chip-strip for any non-dock consumer; can be removed in Stage 3 once nothing imports it — leave for now to avoid churn).

## Behavior contracts

- **Attach**: 20MB cap (reuse `MAX_BYTES`), same upload+ingest as `FileUploadCard`. On success toast → automatically dispatches `analyze-file` tool prompt so the user sees the analysis stream inline. If `files-ingest` errors, surface toast; do not auto-prompt.
- **Voice**: unchanged transcription; only repositioned.
- **Slash**: palette only shows tools where `getToolAvailability(...).available === true`; disabled tools never appear (reasons are still visible on the chip strip elsewhere). Empty query after `/` lists all available tools; typing filters by `label` substring.
- **Audit**: every dispatched tool keeps its existing audit pathway via `vanta-converse` / direct-action handlers. No new audit code in this stage.

## Technical notes

- The dock stays presentational; all side-effects (upload, openSherlock, sheet state) live in `ConversationSurface` so the dock remains reusable.
- Slash palette is a plain `<div role="listbox">` anchored above the textarea (no Popover dep) to keep it keyboard-clean inside the existing `glass` container.
- Mobile (384px): paperclip + mic + send must all fit. Use `h-9 w-9` and tighten gap to `gap-1.5`. The palette is a full-width card above the dock so it never overflows.
- Type-only changes; no new packages.

## Verification

1. Open Companion on any surface → see paperclip, mic, send.
2. Drop a PDF via paperclip → file appears in `ingested_files`, then assistant message streams an analysis (proves end-to-end attach → registry tool dispatch).
3. Type `/` → palette lists registry tools; arrow keys + Enter dispatch.
4. Pick `Run Sherlock` from slash → Sherlock overlay opens scoped to current surface.
5. Pick `Research this` → Research sheet mounts with `ResearchPanel`.
6. Disable SerpApi in Control Room → `Research this` disappears from palette within the controls refresh interval.
7. Mic still works inside `ConversationSurface` (no regression).
