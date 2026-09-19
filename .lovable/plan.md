# Keep the flight section steady during updates

## What will change
- Treat the loading screen as first-load only. Background airline checks and live updates will keep the current flight card, journey, and controls mounted until the replacement data arrives.
- Remove the whole-card opacity pulse during a read. A small status cue beside the existing reading age will show that Echo is checking without dimming the content.
- Preserve the last good flight data if a refresh fails, while showing the existing error state without replacing the card.

## Technical notes
- Update `useFlightPlans` so refreshes do not reset `loading` after the first completed read.
- Update `FlightLive` so `reading` affects only a compact live indicator, not the entire panel.
- Add regression coverage proving a refresh keeps existing plans visible and does not apply a full-panel pulse.

## Acceptance
- At 384px, automatic and manual checks never produce a black/blank flight section.
- Existing values stay readable while fresh data is requested, then changed fields update in place.
- Reduced-motion behavior remains respected.
