# Real airport maps in layover cards

## Goal
Add an optional real map to active and upcoming layover cards without pretending Metro Echo knows gate geometry, indoor walking distance, or an aircraft’s taxi path when providers do not supply them.

## Build
- Add a compact **Airport map** expander to active/upcoming layovers; completed layovers stay collapsed history.
- Reuse the existing Leaflet/OpenStreetMap renderer and the airport coordinates Metro Echo already keeps. Center closely on the actual airport footprint with terminal buildings, roads, and runways visible.
- Overlay only source-supported facts beside the map:
  - arrival and onward terminal;
  - arrival and onward gate;
  - airline/provider or traveler-confirmed source and freshness where available.
- Do not place a terminal or gate pin unless coordinates exist. Text-only gate facts remain clearly separated from map geometry.
- Replace estimated transfer-distance language in this view with explicit states:
  - **Walking distance unavailable** when no indoor route geometry exists;
  - **Taxi-out distance unavailable** when no provider ground track exists;
  - keep any existing time deductions labeled as planning allowances, not measured distance.
- Preserve the current “What’s around you,” connection math, past-layover collapse, route/globe views, and offline text fallback.

## Safety and performance
- Lazy-load the map only when opened; no polling and no new paid API calls.
- Keep the last factual text visible if tiles fail or airport Wi-Fi drops.
- No map remount or card blackout during flight refreshes.
- Do not alter journey records, gates, times, traveler overrides, Receipts, or live flight state.

## Tests and release
- Add focused tests for active/upcoming/past layovers, known/unknown airport coordinates, filed/missing terminal and gate, unavailable walking/taxi geometry, failed/offline map fallback, and no invented pins.
- Run relevant flight/journey suites, full tests, typecheck, production build, and a 384px browser check.
- Publish only if all release checks are safe; report preview versus production explicitly.

## Technical details
- New small `AirportLayoverMap` presentation component plus pure airport-map fact helpers.
- `LayoverCard` supplies the existing `Layover` and onward `Leg`; no schema or migration.
- The existing airport coordinate table remains the map anchor. Leaflet/OpenStreetMap remains the renderer, avoiding a second mapping stack.
- True taxi distance requires provider ground-track points; the current feeds expose neither a taxi route nor gate coordinates, so this release will not manufacture one.
