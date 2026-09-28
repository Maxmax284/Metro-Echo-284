# Project Rules

- Boot ceremony: `bootSequence.ts` (pure) + `BootSequence.tsx` (render) — logic pure so holds and copy stay testable.
- `station.ts` is the only source for season, moon, daylight, lat-band math — on-device from date + coordinates, never a feed.
- `data-sky` (meteorological, `sky.ts`) is strictly separate from `data-weather` (task pressure) — a storm never reads as overdue promises.
- Reduced-motion checks go through `reducedMotion.ts` — one helper only.
- The Curiosity Cabinet only speaks when coordinates exist; no fix means teaching copy, never a guess.
- Atmosphere: `regionTint.ts` (band/daypart/season) + `regions.ts` (seeded, country-gated; unmapped=nothing); precedence band<season<region<skin<wall.
- Wikipedia photos keep attribution: `place-ground-read` resolves artist + license, `FieldPolaroid` shows the credit.
- Fonts (Rubik, Space Mono, OFL) + Leaflet pins bundled under `public/` — no third-party calls for chrome.
- Kept occasions: `occasions.ts` (pure; computus, Nov full moon via station.ts) worn by `stationEdition.ts` as a windowed Today decal — opt-in `vanta.occasions.on`, stale fix never stamped, remembrance quiet, no per-city hardcoding.
- Cabinet dials: home = place marked Home, signal = device's own report, travel = saved places; sixth slot rotates one dial/day (travel/clock/marks) via `rotatingDial` — never past six, unknown counts stay out.
- The live place is only ever a row with geo.source = device — editing a saved place bumps updated_at and must never teleport the app.
- Stamps: deliberate + receipted (`stamped_at`, one event per press/lift, never on a stale fix; `placePatchForFix` clears on a real move). `stationMarks.ts` folds stamp + wrap receipts into the Station stamps wall — name snapshots, no coordinates, rollback removes the mark. Tap opens `MarkRecordSheet`: journeys replay legs via the wrap's journey_id (plan ids joined +), places show press/lift beats; load on tap, gone records say so.
- Intro gates once per account on `profiles.preferences.intro_seen_at` — server flag outranks device state; finishing writes it + records a boot; a failed read skips the intro that launch, never traps.
