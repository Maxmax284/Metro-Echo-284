# Today: sleeker motion, a bulletin board that reads out, plus Travel, Tasks and a real Google calendar

Four things, in order of risk. The motion work comes first because the flicker is a real
bug, not a taste problem.

---

## 1. Kill the flicker (bug, not style)

What's happening: Today re-runs its entrance animation every time data refreshes.
`motion-stagger` re-fires on re-render, arrivals re-play on rows that already
arrived, and several lanes remount because their row keys change on each fetch.
So the page looks like it's struggling — because it is, ten times a minute.

Fix:
- Animate **on first appearance only**, tracked by a stable row id, not by render.
  A row that was already on screen never re-animates when its numbers change.
- Stable keys everywhere in the lanes (event id, commitment id, receipt id) so
  React updates rows instead of tearing them down and rebuilding them.
- Entrance stagger runs once per surface visit, not per data refresh.
- Everything still goes flat when the system's reduce-motion setting is on.

## 2. Make the reading feel like a board that speaks

The bulletin-board idea, taken seriously and kept elegant:

- **Split-flap for changed truth.** Already there on running lines; extend it to the
  numbers and time phrases only, so a stay ending Friday turns over on the word
  that changed instead of the whole card blinking.
- **Type-on read for the one lead line.** The single "here's what matters" sentence
  types out once, fast (about 18ms a character, done inside a second), with a thin
  block cursor that retires when the line finishes. Only the lead line, only on a
  new read — never lists, never on every refresh, never on scroll back.
- **Tape and stamp.** New captures land with a short paper-drop; closed promises get
  the stamp that already exists; stale items desaturate instead of moving.
- **One pulse for the thing that needs you**, and if the state is severe the page
  gets *quieter* — fewer moving parts, more space.
- **Board rails**: a hairline that draws left-to-right under a lane heading as its
  content lands, then stays still. Signals "this lane just updated" without a spinner.

Nothing loops. Nothing animates while idle.

## 3. Travel lane

A lane that appears only when travel is on file: trip dates, flights and hotel stays
read from your calendar (the airline and hotel entries already sync), plus any recorded
trip legs, with a small map per leg drawn from the coordinates on record.

Honest by default: no flight number invented, no hotel address guessed. If the calendar
entry has no location, the row says so.

## 4. Tasks lane

Checkboxes with deadlines, sitting in the same lane order as the calendar. This reuses
the existing promises/commitments store rather than inventing a second to-do system —
so anything you close here shows up in Receipts with a real record. Overdue reads as
overdue; no deadline reads as no deadline.

## 5. Real Google calendar sign-in

Replace the secret iCal link with a proper Google Calendar connection, so every event on
your phone lands automatically, including changes and cancellations. This needs one
approval tap from you when the connect card appears. The iCal path stays working until
the Google one is proven, then it becomes the fallback.

---

## Technical notes

- New: `src/lib/motionOnce.ts` (first-appearance registry keyed by row id), `TypeOnLine.tsx`
  (reduced-motion aware type-on with completion latch), `TravelLane.tsx`, `TasksLane.tsx`.
- `TodaySurface.tsx`: stable keys, once-only stagger, lane rails; lanes render conditionally.
- Travel derives from `calendar_events` (airline/lodging classification in a shared helper,
  server + client mirror) and `trips`/`trip_points`; map reuses `AwarenessMap`, lazy-loaded.
- Tasks read/write `commitments` through existing hooks; no new table.
- Google: `google_calendar` App connector via the connector gateway, called from a new edge
  function that upserts into `calendar_events` alongside the existing ICS sync, keyed by
  provider event id so the two paths cannot duplicate. Cron reuses `calendar-sync`.
- No background tracking, no new notification path, no fifth room.

## Acceptance

- At 384px, Today holds still while data refreshes: no re-run entrance, no layout jump.
- The lead line types once per new read and never again.
- Travel and Tasks lanes are absent, not empty, when there's nothing to show.
- Google-sourced events and iCal events never appear twice.
