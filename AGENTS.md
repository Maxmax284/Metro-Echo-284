# Project Rules

- Boot ceremony lives in `src/lib/bootSequence.ts` (decisions/copy/holds, pure) + `src/components/shell/BootSequence.tsx` (render) — keep logic pure so holds and copy stay testable.
- `src/lib/station.ts` is the only source for season, moon, daylight and latitude-band math — computed on-device from date + coordinates, never from a feed, so it holds offline.
- `data-sky` (meteorological, `src/lib/sky.ts`) is strictly separate from `data-weather` (task pressure) — a thunderstorm must never read as overdue promises.
- Reduced-motion checks go through `src/lib/reducedMotion.ts` — one helper, no per-component reimplementation.
- The Curiosity Cabinet (`src/components/awareness/CuriosityCabinet.tsx`) only ever speaks when coordinates exist; no fix means teaching copy, never a guessed reading.
