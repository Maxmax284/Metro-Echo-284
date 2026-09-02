# Wearable connections — organised by data path, not by brand

Vanta is not designed around one manufacturer. Support is described by how the data
actually reaches the platform.

## Direct sensor

Bluetooth heart-rate straps, broadcasting watches, compatible sensors.
Live in the browser via `src/lib/wearableBluetooth.ts`. Source label: `bluetooth`.
Proof line: `Heart rate · Bluetooth live · 8 sec ago`.

## Phone health layer

Apple Health via Shortcuts / Health Auto Export, Android Health Connect via a
scheduled export. Posts to `wearable-ingest` with a personal token. Idempotent, and
blocked entirely if the activity sense is switched off. Source label: `ingest`.
Proof line: `Daily activity · phone · last sync 06:00`.

## Connected service

Nothing is directly connected today. Fitbit, Garmin, Oura, WHOOP and Samsung Health
are honest "not connected yet" rows — we do not claim support before it exists.
Proof line: `Garmin · not directly connected yet`.

## Manual

Always available, always marked. Source label: `manual`. A manual reading is never
dressed up as a sensor reading.

## What every row must show

- Signal family: heart rate · daily activity · sleep · workouts
- Connection method
- Last reading, with a real timestamp
- Consent state (off means not read, not stored, not inferred)
- Data source
- History readiness — e.g. `Sleep · 9 days of history`, or `Not enough history yet.`

No ambiguous empty charts. A family with no data says so in words.
