# One install button. Then Phase 6 — the real map. Phase 7 — told before you look.

Phase 8 is parked, as you said.

## First — just an install button

In the Control Room, the install card becomes one button: **Install app**. Tap
it, your phone's install prompt opens, done. No steps, no lists, no reading.

- The long numbered instructions come off the Control Room entirely.
- On an iPhone, where Apple gives no button, it stays one short line — Safari's
  Share, then Add to Home Screen — because there is no button to press there.
- The separate install page and its per-phone steps stay reachable behind a
  small "Having trouble?" link, out of the way instead of in your face.
- Already installed, or on a window where a phone cannot install anyway, and the
  card says that in one line instead of showing a dead button.

## Phase 6 — your flight on an actual map

Today the flight card draws two pictures: the stylised arc, and the tap-a-stop
route sketch added last pass. Neither is a real map. Phase 6 adds one.

What you get, inside the same "Your route" card — no new room, no new screen:

- A switch at the top of the card: **Map** or **Sketch**. Map is the default
  once a flight is under way.
- A real map with your route drawn on it, departure and arrival airports marked
  and tappable, and the aircraft sitting on its **filed position** — the same
  fix the telemetry board already reads — turned the way it is heading.
- Tapping an airport opens the same panel you have now: local landing time, the
  clock shift, the money, the emergency number, that city's painted wall behind
  it. Nothing new invented, just the map instead of the sketch.
- No fix on record means **no aircraft on the map**. The route still draws, and
  the card says the position is worked out from the clock, exactly as the arc
  does now. The map never carries a plane Echo cannot prove.
- The map is loaded only when you open that card and is fenced off, so a map
  problem can never take the words down with it — same pattern the awareness
  map already uses.

## Phase 7 — the alert reaches you before the screen does

The watcher that reads gate moves, delays, cancellations and landings is already
built, already speaks phone-first with chat as fallback, already respects quiet
hours and leaves a receipt. The gap is plain: **nothing is running it.** It only
ever fires when a screen is open, which is why alerts feel like they follow the
arc instead of leading it.

Phase 7 turns it on:

- The watcher runs on its own every ten minutes, whether or not any screen is
  open — so a gate change lands on your phone before you look.
- It still only reads flights close to a filed time, still stops at the 40 reads
  a day ceiling, and still reports a change rather than a status: "nothing
  moved" sends nothing.
- Gate and terminal moves, delays of half an hour or more, cancellations and
  diversions, and your landing each get one notice on one surface. Acting on it
  clears the Today row, the same shared acknowledgement you have now.
- Quiet hours keep holding everything except a cancellation or a diversion.

## Technical notes

- Install: `InstallVantaSection.tsx` trims to one primary button driven by
  `usePwaInstall().canPrompt` / `promptInstall()`, a single iOS line, and a
  "Having trouble?" link to `/install`. `installBlockedHere()` and installed
  state each collapse to one sentence. `/install` and `InstallApp.tsx` keep the
  full steps; Settings loses the numbered copy.
- `src/components/schedule/FlightRadarMap.tsx`: react-leaflet (already in the
  project, as in `AwarenessMap`/`ProjectsMapInner`) — tile layer, `Polyline` for
  the route from `routeStops` coordinates, `divIcon` airport dots, and a rotated
  aircraft `divIcon` at `live.position.lat/lon`. Lazy + error boundary, cloning
  `AwarenessMapPanel`'s fence.
- Extract the existing stop-detail panel out of `FlightRouteMap.tsx` into a
  shared `RouteStopPanel` so both views use one panel and one set of kept facts
  (`arrivalFacts`, `placeWalls`). Add the Map/Sketch toggle in the card header;
  Sketch stays the reduced-motion and no-network answer.
- Aircraft marker renders only when `trackProgress(live).source === "radar"`;
  a fix older than the existing staleness window keeps the marker but marks it
  aged, matching `fixWords`.
- Phase 7 is one migration: `cron.schedule('metro-echo-journey-watch', '*/10 * * * *', ...)`
  posting to `journey-watch`, idempotent unschedule first, following the
  `sherlock-patterns-nightly` migration exactly. No function logic changes —
  `journeyNotice`, `reachOnce`, quiet hours, dedupe keys and the 40-read budget
  all stay as written.
- Verification: unit tests for the map placement helpers, then the flights
  screen at 384px, plus one forced watcher run to confirm a notice reaches the
  phone and clears its Today row.
