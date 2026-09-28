# Project Rules

- Boot ceremony: `src/lib/bootSequence.ts` (pure) + `BootSequence.tsx` (render) — logic stays pure so holds and copy stay testable.
- `src/lib/station.ts` is the only source for season, moon, daylight and lat-band math — on-device from date + coordinates, never a feed.
- `data-sky` (meteorological, `src/lib/sky.ts`) is strictly separate from `data-weather` (task pressure) — a storm never reads as overdue promises.
- Reduced-motion checks go through `src/lib/reducedMotion.ts` — one helper only.
- The Curiosity Cabinet only speaks when coordinates exist; no fix means teaching copy, never a guess.
- Atmosphere: `regionTint.ts` (band/daypart/season) + `regions.ts` (seeded, country-gated; unmapped=nothing); precedence band<season<region<skin<wall.
- Wikipedia photos keep attribution: `place-ground-read` resolves artist + license, `FieldPolaroid` renders the credit — never strip it.
- Fonts (Rubik, Space Mono, OFL) and Leaflet pins are bundled under `public/` — no third-party calls for the app's own chrome.
- Kept occasions: `src/lib/occasions.ts` (pure; computus, Nov full moon via station.ts), worn by `stationEdition.ts` as a windowed Today decal. Opt-in `vanta.occasions.on`; stale fix never stamped; remembrance quiet. No per-city hardcoding.
- Cabinet dials: home = place marked Home, signal = device's own report, travel = saved places only. The sixth slot rotates one dial/day (travel/platform clock/marks) via `rotatingDial` in `stationMarks.ts` — never grows past six; unknown counts stay out.
- The live place is only ever a row with geo.source = device — editing a saved place bumps updated_at and must never teleport the app.
- Stamps are deliberate + receipted (`stamped_at`, one audit event per press/lift, echoed at boot, never on a stale fix; `placePatchForFix` clears on a real move). `stationMarks.ts` folds stamp + journey-wrap receipts into the Station stamps wall in Receipts — name snapshots, no coordinates, rollback removes the mark.
- The once-per-account intro gates on `profiles.preferences.intro_seen_at` — server flag outranks device state, so the Google sign-in round trip can't bypass it. Finishing writes the flag + records a boot; a failed read never traps (intro skipped that launch).
