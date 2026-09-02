# Finish the Unified Polish pass

## Where we are now

Already landed:
- Ask thread spine with search and always-labelled Pinned / Recent / Archived groups.
- "Connect your world" in Settings → Connections: one honest state per connection plus a proof line drawn from recorded events.
- Composer already has attach / camera / voice, and answers already render structured.
- Aftermath lines exist for all 17 surfaces (`SurfaceAftermath`), the glossary panel exists, and the motion vocabulary is already centralised in `src/lib/motion.ts` with the feel knob reaching JS via `feelMs()`.

Still open (this plan closes it):
- The two audit documents were never written.
- Room help is uneven: Work has "What can I do here?" (`DeskInfo`) and a verb-first quick-action strip; Today, Ask and Receipts have no equivalent, and no room states its help in one consistent shape.
- The motion / street accent polish pass (Wave 5) was never done as a pass.

## What gets built

### 1. Room help, one shape everywhere
A single `RoomHelp` panel used by all four rooms, opened from a small "What is this room?" control in the room header. Every room answers the same six lines, written not generated:

1. What this room is for.
2. What lands here, and how it got here.
3. What you can do here.
4. What this room will never do (the law it holds).
5. Where things go next.
6. Why it looks empty, when it is empty.

Work keeps its existing desk-level help; this sits above it at room level. Nothing here reads state or executes.

### 2. Audit documents
- `.lovable/vanta-unified-polish-audit.md` — a walk of every room and desk at 384px: what each surface says on arrival, whether it teaches, whether tap targets clear 44px, where copy still reads technical, and what is still confusing. One row per surface, honest verdicts only.
- `.lovable/vanta-synchronization-audit.md` — every hand-off between rooms (Ask → Work, Today → desk, Sherlock → project, Telegram → capture, wearable → Today/Work): does the same object arrive with the same identity, does scope hold, does a receipt get written. Findings recorded, and any true breakage fixed in the same pass.

### 3. Motion and street accents
A restrained pass, no new libraries:
- Arrival, locking and settling all pulled through the existing motion constants — no more one-off durations in components.
- Street accents kept to structure, not decoration: corner cuts on desk tiles, a single status light per connection row, hairline rules where a section changes meaning.
- Respect `prefers-reduced-motion` and the feel knob everywhere; no looping ambient motion on Today (that flicker fix stays intact).

## Technical notes

- New: `src/components/ui/room-help.tsx` plus copy in `src/lib/roomCopy.ts` (extend the existing file, do not duplicate it).
- Audits are documents under `.lovable/`; only real breakage found by the sync audit gets code changes, and each fix is listed in the doc.
- Motion changes are class and token swaps against `src/lib/motion.ts`; no new animation utilities.
- Verification: typecheck, existing test suite, and a 384px browser walk of Today / Work / Ask / Receipts with screenshots.
