# Project Rules

- Boot ceremony lives in `src/lib/bootSequence.ts` (decisions/copy/holds, pure) + `src/components/shell/BootSequence.tsx` (render) — keep logic pure so holds and copy stay testable.
- `src/lib/station.ts` is the only source for season, moon, daylight and latitude-band math — computed on-device from date + coordinates, never from a feed, so it holds offline.
- `data-sky` (meteorological, `src/lib/sky.ts`) is strictly separate from `data-weather` (task pressure) — a thunderstorm must never read as overdue promises.
- Reduced-motion checks go through `src/lib/reducedMotion.ts` — one helper, no per-component reimplementation.
- The Curiosity Cabinet (`src/components/awareness/CuriosityCabinet.tsx`) only ever speaks when coordinates exist; no fix means teaching copy, never a guessed reading.
- Region tint is procedural: `src/lib/regionTint.ts` (pure) + `RegionTintChannel.tsx` set `data-lat-band`/`data-daypart`; index.css paints. No per-country assets — a chosen `data-skin` always wins over the tint.
- Wikipedia photos ship with attribution: `place-ground-read` resolves artist + license per photo and `FieldPolaroid` renders the credit under each image. Licenses require it — never strip it.
- Fonts (Rubik, Space Mono, OFL) and Leaflet pins are bundled under `public/fonts` and `public/vendor/leaflet` — no third-party calls to render the app's own chrome.
- Kept occasions live in `src/lib/occasions.ts` (pure): fixed dates, weekday rules, and astronomy (computus, November full moon via station.ts). Opt-in per device via `vanta.occasions.on`; a stale fix never gets stamped; remembrance tone stays quiet. No feed, no per-city hardcoding beyond the curated four-region seed.
