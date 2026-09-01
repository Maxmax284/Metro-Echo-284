# Watch dashboard, body context in Work, and one honest end-to-end run

Three pieces: a real trends page for the watch, body signals feeding the Work desk as context, and a self-test path that proves the loop end to end without pretending anything happened that didn't.

Confirmed current state: the `wearable_readings` table is empty (no rows of any kind), so every new surface has to open in a truthful empty state and only fill in once real readings arrive. `wearable-ingest` already accepts `heart_rate`, `steps`, `sleep`, `workout`, `stand`.

## 1. Watch dashboard (`/watch`)

A new page linked from the top of `/wearable-loop` ("See the trends").

- Header line: what was measured, when, and from where. No invented numbers.
- Steps: last 14 days as a small bar strip, plus today vs. your 7-day median. Days with no record are shown as gaps, never zeros.
- Heart rate: last 48 hours as a sparkline (resting low, working high), plus the last reading with its source.
- Workouts: a short list — when, how long, and which day it belonged to.
- Posture trend: the postures recorded across the week, with the note that you set them and Vanta only suggested.
- Empty state teaches: it says exactly which sense is off and what to do to get a first reading.
- Aftermath footer: reading trends changes nothing; it never routes or approves.

## 2. Body signals feed the Work desk

Body facts become *context for how Work speaks*, never a driver of work items.

- A "Your body" line inside the Work briefing header area: e.g. "Trained this morning · 8,400 steps · you set Training at 06:10". Present only when a reading and consent exist.
- Workouts and high heart rate feed the existing posture suggestion, which already only suggests. Work's briefing copy adapts: during Training and just after a workout, the desk leads with the shortest lane and holds ordinary noise (critical items still surface).
- New shared reader so Today's body panel and Work read the same facts from one hook — no second query path, no divergence.
- Nothing in Work gains a body-triggered action button. Body affects tone and ordering, not approval.

## 3. Run the loop end to end

The Bluetooth connect step has to happen on your own device — a sandbox has no watch. So the page gets a real self-test that leaves genuine records:

- `/wearable-loop` gains "Send a test workout" (only when activity consent is on): posts one workout reading through your private ingest link exactly as your phone would, then shows where it landed.
- After it lands, the page links straight to the two places it shows up: Today's "Your body" panel and the Work desk body line.
- The five-step walk stays record-driven: the "Watch connected" step only ticks from a Bluetooth reading, so a test workout can't fake the wrist step.
- I'll run the ingest → Today → Work path myself in the preview and report the actual result, then hand you the one remaining manual step: opening `/wearable-loop` on your phone and pairing the strap.

## Technical notes

- New page `src/pages/Watch.tsx` + route `/watch`; trend math added to `src/lib/wearable.ts` (pure, unit-tested: day bucketing, medians, gaps).
- New `useWearableTrends.ts` reading `wearable_readings` over 14 days, scope-filtered via `applyScope` like the existing hook.
- Work: a `WorkBodyLine` component fed by `useWearableLoop`, rendered inside `WorkSurface` above the briefing; briefing lane ordering reads posture from `VantaContext`.
- Test workout posts to the existing `wearable-ingest` function with the token minted by `wearable-link`. No new table, no new function, no schema change.
- Consent gates unchanged: `heart_rate` and `activity`. Off means nothing read, nothing shown, nothing stored.
