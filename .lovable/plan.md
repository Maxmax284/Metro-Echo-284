# Clarity, Ask Organization, and Motion Language Pass

Keeps the four rooms (Today / Work / Ask / Receipts) and the street identity. No fifth room, no redesign. The goal: the information layer becomes as intentional as the artwork.

## What's already in place (verified)

- Ask thread management exists: rename, pin, archive/restore, delete, new thread, archived section (`ThreadSpine.tsx`, `askThreads.ts`).
- Background motion was already stripped in the last pass — graffiti and walls are static.
- Work already has Recent projects, a Desks grid, and a Deeper tools grid, plus a short Desks helper line. Cockpit sits inside Deeper tools already.
- Today has Happening Now / Resume / Agenda sections and structured Ask response blocks.

So this pass is clarity, organization, and motion — not rebuilding those systems.

## Phase 1 — Audit

Write `.lovable/vanta-clarity-motion-ask-audit.md` classifying every room section as: strong / needs clarification / needs hierarchy / needs organization / needs motion refinement / missing. Confirm mobile behavior at 384px and reduced-motion coverage before touching UI.

## Phase 2 — Section clarity + adaptive helper copy

- One shared section-description slot: a single plain line under each section header ("Live activity Vanta already recorded", "Upcoming promises and follow-ups", "Recent state changes across this space", "New captures not sorted yet", "Pick up work that is still open").
- Adaptive helper copy: full line for the first few visits per section, then collapse to an info affordance. Stored locally per section, no onboarding system.
- Remove duplicated explanatory paragraphs where a section description now covers it.
- Readability floor: raise smallest body text, tighten badge usage, trim dense metadata rows. Two facts land, five blur.

## Phase 3 — "Explain this screen"

Small contextual Ask entry point in each room header. Tapping it opens Ask with the current room/context bound and answers from a grounded room description (no free-form guessing). Reuses the existing `openAskWithContext()` contract.

## Phase 4 — Motion language doctrine

Lock the vocabulary in `src/lib/motion.ts` and apply:

- Live data (Happening Now, bulletin): short slide in, left cyan line draws, text, timestamp locks, settle. Only the first few rows animate on a burst.
- Historical data (What Changed, Receipts): heavier settle with a stamp/lock-in, lower motion.
- User actions: lift and confirm. Navigation: matched travel (FLIP already present). Background: does not move.
- All of it respects reduced motion and the existing feel knob.

## Phase 5 — Work hierarchy

Regroup the desks as presentation only, no route changes:

- Daily work: Inbox, Commitments, Actions
- Knowledge: Briefs, Documents, Memory
- Deeper tools: Schedule, Sherlock, Awareness, Cockpit (de-emphasized, labeled as an advanced dense view)

Keep the word "Desks" with the helper line "Desks hold the different kinds of work Vanta tracks."

## Phase 6 — Ask organization

- Thread spine on mobile becomes a proper slide-over sheet with New thread / Pinned / Recent / Archived, each row showing title, relative time, scope, one context tag.
- Composer: collapsed "Ask Vanta…" with attach / camera / voice / send. Attachment menu exposes sources (Camera, Photos, Files) — never modes like OCR or Research.
- Attachments: image thumbnails, files as chips, restrained horizontal strip, remove/inspect.
- Contextual suggestions capped at 3–4, keyed to the bound context (project / document / receipt / today item).

## Phase 7 — Receipts expansion

Receipt arrival motion (number increments, stamp lands, timestamp locks, settle) and tap-to-unfold in place showing what changed, before/after, actor/source, time, and reversal state.

## Phase 8 — Front door

Give sign-in the same city: stronger street identity, still simple and readable. No animation demo.

## Technical notes

- New shared pieces: a `SectionNote` component for descriptions, a `useHelperFamiliarity` hook (local counts per section key), and motion tokens for `arrive` / `stamp` / `confirm` / `travel`.
- No schema changes. Ask thread tables and scope filtering stay as they are; every new query path keeps `applyScope`.
- Tests: Ask thread lifecycle, helper-familiarity collapse, section descriptions present, receipt expansion, Work grouping, no cross-scope leakage. Full suite plus typecheck at each phase.
- Docs produced: the audit, `.lovable/vanta-clarity-motion-system.md`, `.lovable/ask-organization-experience.md`, `.lovable/work-room-hierarchy.md`.

## Sequencing

I'd ship Phases 1–5 first (clarity, explain-this, motion, Work hierarchy) since those change how the platform reads on first contact, then Ask organization and Receipts, then the front door.
