# Ask Complete Overhaul + Multimodal + Sync + Street Identity

Ask stays inside the four rooms. No fifth room, no second AI surface. This finishes the parts of the brief that aren't built yet and repaints the walls last.

## What's already real (verified in the code)

- One thread engine and lifecycle: `askThreads.ts` (pin/rename/archive/delete, scope-isolated) plus `AskThreadProvider`.
- Shared volatile state across quick Ask and full Ask: `askSession.ts` (drafts, transcript cache, live streaming, abort).
- Context strip, attachment strip, thread spine with live/stop controls, structured blocks, inline approvals.
- Capability registry with input/device gates (`companionTools.ts` + `askCapabilities.ts`), routing engine (`orchestration/capabilityRouter.ts`), sanitized external research in `vanta-converse`.
- Thread output references (`outputs`, `outputChips`) already modelled.
- One ambient backdrop system with five skins and per-room parallax.

So Phase 1A/1B and most of Phase 2 exist. The real gaps are below.

## Wave 1 — Audit document

Write `.lovable/ask-complete-overhaul-audit.md` classifying every item in the brief's audit list as Live / Partial / Reusable / Missing / Needs replacement / Deferred, with before/after notes appended at the end. No rebuilding of healthy systems.

## Wave 2 — Quick Ask surface replacement (Phase 1C)

Replace the floating-bubble presentation with a shell-native surface, same thread engine underneath:

- Desktop: a right-side companion drawer docked into the shell, not a floating card.
- Mobile: an expandable bottom sheet — partial height for a quick turn, full height for a longer one, then "Continue in Ask".
- "Continue in Ask" carries the same thread, context, attachments, messages, scope and pending action state, and uses the existing FLIP travel so the drawer visually becomes the room. No new thread, no restart.

## Wave 3 — Multimodal composer finish (Phase 2 remainder)

- One composer component shared by drawer, sheet and room — today the dock and the room each own composer markup.
- Video: honest readiness state rather than a fake capability; the seam stays so it can turn on later.
- Desktop drag-and-drop into Ask that inherits the bound project context.
- Compact horizontal file/image chips with processing state, no vertical file walls.
- Human processing lines ("Reading the document…", "Checking context…"), no fake reasoning logs.

## Wave 4 — State synchronization (Phase 3 remainder)

Ask-issued state changes land in the platform immediately, and Ask reflects platform changes:

- "Mark waiting on Nikki" / "Add this as a decision" / "Save this as an artifact" write through the existing work-state paths, then invalidate so Work updates without a reload.
- Every Ask-created object inherits authoritative scope from `useActiveScope()`.
- Thread output chips link to the real objects; nothing is duplicated inside the thread.
- Ask may prepare and stage only. Execution still runs through the approval gate and produces a receipt.

## Wave 5 — Street / graffiti identity pass (Phase 4)

One wall per room, one city. Art behind content, heaviest at the edges, centre clear, one dominant tag per room, wall barely moves:

- Today — rolling shutter at dawn, sodium bleed.
- Work — rail yard wall, stacked block letters, chalk and overspray.
- Ask — wet alley at night, one tall thin tag, narrow lamp, faint mist. Strongest treatment, but never over the message text.
- Receipts — paste-up wall, torn edges, tape, stamps.
- Settings — maintenance door, worn stencil.

Plus badge reduction (two facts land, five blur), headline hierarchy, body-text minimums, numeric breathing room. Graffiti type for identity moments only.

## Wave 6 — Validation

384px and desktop passes, reduced-motion pass, keyboard and screen-reader labels, 44px targets, no horizontal overflow, calm state stays computationally calm. Existing test suite stays green; add non-timing tests for the shared composer, context handoff, scope inheritance on Ask-created objects, and honest readiness states.

## Technical notes

Expected files: `src/components/shell/ConversationDock.tsx` (becomes drawer/sheet host), a new shared `AskComposer`, `src/components/surfaces/ConversationSurface.tsx`, `src/components/ask/*`, `src/lib/askSession.ts`, `src/lib/askThreads.ts`, `src/lib/companionTools.ts`, `src/components/shell/AmbientBackdrop.tsx`, `src/lib/skins.ts`, `src/index.css`, plus the audit doc and tests. Backend touched only if a work-state write path is missing; no schema changes planned, no new dependencies.
