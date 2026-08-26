# Clarity / Motion / Ask audit — 2026-08-26

Read of the four rooms before changing anything.

## Already strong

- Four-room model (`src/lib/navigation.ts`), no fifth room, bottom nav stable at 384px.
- Ask thread engine: create, rename, pin, archive/restore, delete, auto-title, context binding, outputs (`askThreads.ts`, `AskThreadProvider`, `ThreadSpine`).
- Composer already collapsed with attach / camera / voice / send and a source-based attach menu — no user-facing OCR/Vision/Research modes.
- Backgrounds are static after the last pass: no looping grid drift, neon rain, sheen breathing, or scroll parallax. Graffiti does not animate.
- Receipts filters (kind, event class, free text), mono timestamps, scope-guarded realtime.
- Scope isolation via `applyScope` across surfaces; reduced-motion block in `index.css` covers every animation class.

## Needed clarification

- Sections carried either no description or a long paragraph, and the same paragraph forever. Fixed: one-line `SectionNote` per section, collapsing after three visits (`roomCopy.ts`, `useHelperFamiliarity.ts`).
- No way to ask "what is this screen?" Fixed: `ExplainThisButton` in Today, Work, Ask, Receipts — grounded written copy, no AI call, with a hand-off into Ask.
- Re-entry cards fell back to "Work outside a project". Fixed: `continuityName()` names the work after the record behind it.

## Needed visual hierarchy

- Work put Desks and Deeper tools at equal weight. Fixed: Daily work / Knowledge inside Desks, Deeper tools moved to a quieter dashed panel, Cockpit relabelled "Advanced dense view".

## Needed motion refinement

- Live and historical rows shared one animation, so an arrival and a record looked identical. Fixed with the doctrine below.
- Bursts of live rows staggered. Fixed: only the first three new rows animate.

## Motion doctrine (implemented)

| Data | Motion | Class |
| --- | --- | --- |
| Live | slides in from the left, status rail draws, locks | `MOTION_ARRIVE` |
| History | presses in and settles | `MOTION_STAMP` |
| User action | lift / press / commit | `MOTION_PRESS`, `MOTION_COMMIT` |
| Navigation | matched travel | `flip.ts`, `MOTION_SHEET` |
| Background, graffiti | none | — |

## Reusable

`SectionRail`, `state-views`, `vanta-card`, `flip.ts`, `feelMs()`, `vantaVoice`, `StructuredResponse` blocks — all reused, none rebuilt.

## Intentionally deferred

- Thread search inside Ask (the spine is short enough that grouping solved the real complaint).
- Cockpit consolidation: de-emphasised now, not removed. Revisit once usage says it is redundant.
- Front door: already branded in the previous street pass; left alone rather than re-styled.
