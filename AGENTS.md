# Project Rules

- Boot ceremony: `bootSequence.ts` (pure) + `BootSequence.tsx` (render) — pure logic keeps holds + copy testable.
- `station.ts` alone computes season, moon, daylight, lat-band — on-device from date + coordinates, never a feed.
- `data-sky` (meteorological) stays strictly separate from `data-weather` (task pressure) — a storm never reads as overdue promises.
- Reduced-motion checks go through `reducedMotion.ts` — one helper only.
- The Curiosity Cabinet only speaks with coordinates; no fix = teaching copy, never a guess.
- Atmosphere: `regionTint.ts` (band/daypart/season) + `regions.ts` (seeded, country-gated; unmapped=nothing); precedence band<season<region<skin<wall.
- Wikipedia photos keep attribution — `place-ground-read` resolves artist + license, `FieldPolaroid` shows it.
- Fonts (Rubik, Space Mono, OFL) + Leaflet pins bundled under `public/` — no third-party calls.
- Kept occasions: `occasions.ts` (pure; computus, Nov full moon via station.ts) worn by `stationEdition.ts` as a windowed Today decal — opt-in `vanta.occasions.on`, stale fix never stamped, remembrance quiet, no city hardcoding.
- Cabinet dials: home = place marked Home, signal = device report, travel = saved places; sixth slot rotates one dial/day (travel/clock/marks) via `rotatingDial` — never past six, unknowns stay out.
- The live place is only ever a geo.source = device row — editing a saved place bumps updated_at, never teleports the app.
- Stamps: deliberate + receipted (`stamped_at`, one event per press/lift, never on a stale fix; a real move clears). `stationMarks.ts` folds stamp + wrap receipts into the Station stamps wall — name snapshots only, rollback removes the mark. Tap opens `MarkRecordSheet`: journeys replay legs via journey_id (plan ids joined +), places show press/lift beats; load on tap, gone records say so.
- Intro gates once per account on `profiles.preferences.intro_seen_at` — server flag outranks device state; finishing writes it + records a boot; a failed read skips, never traps.
- Control Room IA: 9 groups in plan order (start, you, awareness, notifications, time, mail, connections, feel, records); aliases calendar→time and spending→records redirect in SettingsGroup; connection health renders once (SystemHealthLine → /settings/integrations), proactive awareness lives in Your awareness not Time.
- Notification rail: one floor gate in `_shared/delivery/reach.ts` owns floors AND the person's quiet window (`readQuietHours`/`applyQuietHours` in `_shared/notifyPolicy.ts`) — only `urgent` punches through quiet hours, everything else waits and leaves a `nudge.held_by_settings` receipt (`held_reason`: quiet_hours | floor | push_off). Subscribing a device sets `push_reminders_enabled` (pushClient); "Test a pulse" lives in the Notifications group and calls `push-test` — it ignores quiet hours because the person asked.
