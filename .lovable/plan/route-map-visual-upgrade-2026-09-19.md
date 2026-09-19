# Route-map visual upgrade

## Build
- Replace straight Leaflet segments with dateline-safe great-circle paths, split into completed and remaining portions only when a trustworthy progress source exists.
- Keep aircraft markers source-honest: airline fix on the geographic map; time interpolation only on the abstract flight arc; no plane when position is unknown.
- Add clear origin, connection, and destination markers with airport codes, active-leg emphasis, compact source labels, and stable in-place updates.
- Preserve Sketch and add a lightweight selectable Globe made with SVG projection rather than a heavy 3D dependency. The globe will show true curved geography, confirmed journey legs, and an aircraft only from a current provider fix.
- Put optional display controls behind a compact options panel and keep the default card uncluttered.

## Safety and fallbacks
- Keep the current journey, countdown, timezone, codeshare, gate, overrides, offline cache, Today, Receipts, and notification logic untouched.
- Lazy-load map/globe visuals behind the existing error fence. Offline tile failure leaves the route geometry and Sketch available.
- Disable drawing, pulsing, rotation, and smooth movement under reduced motion; avoid remounting during telemetry refresh.

## Verification
- Add focused tests for great-circle/dateline geometry, source labels, unavailable position, current versus future legs, Map/Globe/Sketch switching, and reduced-motion hooks.
- Run the flight, journey, timezone/countdown, telemetry, and route suites, then typecheck and production build.
- Verify the route card at 384px and desktop width without changing live travel records.
- Do not publish unless explicitly requested after verification.
