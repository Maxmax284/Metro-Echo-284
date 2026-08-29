# Vanta Next Pass — Work Briefing, Universal Aftermath, Cross-Device Continuity

No fifth room. No second chat surface. No autonomous execution. Capture never executes.

## What I confirmed first

- `WorkSurface.tsx` opens as a directory: Recent projects, Desks (Daily work / Knowledge), Deeper tools. There is no "state of work" briefing above the desks.
- The comprehension primitives already exist and are reusable: `card-meta`, `provenance`, `freshness`, `why-this`, `AftermathFooter`, `AftermathHint`, `state-views`, `glossary-panel`. Aftermath appears on ~15 files, so coverage is partial, not universal.
- Cross-device context already persists: `VantaContextProvider` writes/reads a context slice on `profiles.preferences`, and `deviceClass.ts` detects the current body. Nothing surfaces it — `ResumeWorkSection` resumes from records, not from "you were on your phone 18 minutes ago".
- No shared inline object-history component and no shared inferred/confidence label component exist yet.

## Wave 1 — Audit doc + Work front page

Write `.lovable/vanta-next-pass-audit.md` classifying every desk and primitive (already strong / needs hierarchy / needs aftermath / needs history / needs confidence / needs cross-device wiring / deferred).

Add a compact Work briefing above the desks, driven by data already queried in Work plus existing priority fields — no new scoring:

```text
Start here: 1 approval is waiting.     <- exactly one promoted tap
Needs you      approvals / decisions only
Arrived        new unrouted captures
Due            nearest commitments + calendar items
Drifting       stale projects / existing nudges
```

Rows collapse when empty; the whole block stays short — a summary, not a second dashboard.

## Wave 2 — Two shelves

Regroup the existing desks (no route or schema changes):

- **Where work lands** — Projects, Inbox, Commitments, Actions, Briefs, Documents, Schedule
- **Where Vanta looks** — Memory, Sherlock, Awareness, Cockpit

Ten equal choices become two mental models. `DeskInfo` peeks stay.

## Wave 3 — Universal aftermath + teaching empty states

Sweep the remaining surfaces so every meaningful card carries one meta line (`Commitment · due Fri · opens Commitments`) and every state change confirms its aftermath (`Filed to GroundStay rollout · appears in Receipts`). Trivial taps get nothing.

Every empty desk says how something arrives there, one sentence, via `state-views`.

## Wave 4 — Inline object life + visible confidence

- New `ObjectLife` strip: `Captured from Telegram → filed to project → moved once → due Fri`. Built only from recorded receipt/audit events; never invented, never the full log. Used on capture, commitment, action and document detail cards.
- New `InferredLabel`: reads (`Read from calendar`, `From Telegram`) look normal; inferences read as inferences (`Likely related to CampStay`, `Uncertain — needs review`), on the card, not in a tooltip. Wired to existing confidence fields on Sherlock findings, entity links and awareness signals.

## Wave 5 — Undo truthfulness

Audit reversible actions against the existing rollback engine. Expose Undo consistently where rollback is real, show reversal state, and state plainly before execution where it is not reversible. No fake undo.

## Wave 6 — Cross-device carry + resume

Extend the persisted context slice to carry active thread, current object context, draft state, last meaningful action, scope and resume anchor. Never carry approval, cross-scope context, or transient sensitive state.

Add a single quiet resume line on Today when the last activity came from a different device recently and is still relevant:

```text
You were on GroundStay 18 minutes ago on your phone.
Last step: reviewed booking drift.        [Resume]  [Dismiss]
```

Scope-filtered, quiet-hours aware, one at a time, dismissible.

## Wave 7 — Mobile reduction + first-run

At 384px, cut duplicate metadata and long copy in Work and the dense desks down to one state line, one meta line, one next step, with detail behind a tap. First-run teaches through one real note: create → lands as capture → aftermath → destination → receipt. No carousel, no demo data.

## Wave 8 — Tests, docs, and next-stage notes

Tests: Work briefing priority and single Start Here, two-shelf grouping, aftermath/meta coverage, object-life from real events only, confidence labelling, undo available vs unavailable, cross-device carry with no approval carry-over and no scope leakage, teaching empty states.

Docs: `.lovable/vanta-work-front-page.md`, `.lovable/vanta-aftermath-and-object-life.md`, `.lovable/vanta-cross-device-continuity.md`, `.lovable/vanta-expansion-after-clarity.md` (recommendations only — calendar write-back, read-only mailbox, suggested posture, WhatsApp capture stay unbuilt).

## Technical notes

Presentation-first: no schema changes expected beyond reusing `profiles.preferences` for the context slice. `applyScope` stays on every query. Receipts, confirmation gates and rollback behaviour untouched. Wearables, camera, voice output, learned attention and autonomous behaviour stay out of this pass.
