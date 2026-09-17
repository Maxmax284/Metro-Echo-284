# Animated day strip for the Agenda Board

## What changes
- Add one compact animated strip above the selected day’s entries in the Agenda Board.
- Show the day as a truthful timeline: first visible start, last visible end, event markers, and a moving “now” marker only when the selected day is today.
- Label the current state in plain English: **Now**, **Next**, **Clear for…**, or **Day complete**.
- Keep all existing calendar rows, flight approvals, money, medication, and nearby-care sections unchanged beneath it.

## Behaviour
- Timed entries become positioned markers using their real start times; all-day entries remain in the list and are not given a fake time position.
- The active event gets a gentle live pulse. The “now” marker advances from real local time and refreshes without reloading the page.
- Selecting another day transitions the strip to that day but removes the live marker, so motion never implies that a future or past entry is happening now.
- Empty days stay quiet: no decorative fake timeline.
- Motion respects Metro Echo’s Feel setting and reduced-motion preference.

## Technical details
- Add a focused `AgendaLiveStrip` presentation component and small pure timeline helpers in `agendaBoard.ts`.
- Reuse the existing timezone, agenda events, semantic colors, live-ping language, and motion tokens.
- Mount it only in `AgendaBoard`, directly above the selected day’s detailed rows.
- Add unit tests for timeline bounds, marker placement, active/next state, gaps, completed days, all-day handling, and timezone-safe inputs.

## Validation
- Run the focused agenda tests and the project’s automated checks.
- Verify the Board at 384px and desktop widths, including today, another day, overlapping entries, all-day entries, and reduced motion.
