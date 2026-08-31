# First-hour comprehension

## Verb-first desks
`DESK_VERB` in `src/lib/deskRoles.ts` gives every desk one verb line, shown as
the first sub-line on the Work tile and at the top of the "?" panel:

Projects "Keep a job together." · Inbox "File what came in." · Commitments
"Keep a promise." · Actions "Approve a step." · Briefs "Build something
shareable." · Documents "Review and revise files." · Schedule "See what time is
doing." · Memory "Find what Vanta already knows." · Sherlock "Investigate what
feels off." · Awareness "See what Vanta is noticing." · Cockpit "Read the dense
operational view."

No new object names were introduced.

## "I've got something."
`src/components/intake/GotSomethingChooser.tsx` — one control in Today and Work.
The user types plainly, then picks:

- Just park it -> a capture in Inbox
- It's a promise -> an open commitment, no date until they give one
- It needs a step -> a `proposed` action, which still needs approval

Nothing executes. Routing is never guessed: with no choice made, nothing is
filed, and the panel says to park it when unsure. Inserts go through
`useScope().withScope`, so scope isolation holds.

## Quiet reading tier
Work's third tier is a persistent `CollapsibleSection`. It stays folded on a
fresh account and reads "Where Vanta looks · nothing needs your attention yet".
It opens itself once intake exists, and a live Sherlock finding forces it open —
real findings are never hidden behind a fold.

## One guided lap, on real content
`src/components/today/FirstLapCard.tsx` — five steps: capture something real,
route it, see where it landed, read the receipt, see how it comes back on Today.
Steps one and two are read from real records (`notes`, `capture_routes`), so the
card cannot claim work the user did not do. The two reading steps complete when
the room is actually opened. The card disappears when the lap is done or
dismissed. The no-data Work storyboard remains as an optional replay.

## Safety boundaries
Presentation and capture only. No execution, no approval, no autonomous
behaviour, no new store.
