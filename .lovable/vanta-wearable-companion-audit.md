# Vanta Wearable Companion — audit

Date: 2026-09-02. One Vanta, many bodies. This is what the wearable layer actually
is today, part by part, with no credit taken for things that only half exist.

## Already live

| Part | Where |
| --- | --- |
| Posture states, manual set, expiry | `awareness/context.ts`, `VantaContextProvider`, `PostureSection` |
| Per-sensor consent (heart rate, activity) | `SensorConsentSection`, read by ingest before storing |
| Bluetooth heart-rate reads | `src/lib/wearableBluetooth.ts` |
| Phone health / Shortcuts ingest | `supabase/functions/wearable-ingest` (token, idempotent, consent-gated) |
| Manual reading entry | `WearableReadingsPanel` |
| Readings store | `wearable_readings` (kind, value, unit, measured_at, source) |
| Daily sweep | `wearable.sweep` audit events, read by `useWearableLoop` |
| History and trends | `stepsByDay`, `sleepByDay`, `heartSeries`, `workoutList`, `bodyCompare` |
| Body context in Today | `TodayBodyPanel` |
| Body context in Work | `workBodyContext`, `WorkBodyNote`, `WorkBodyLine` |
| Pages | `/wearables`, `/wearable-loop`, `/watch`, `/motion` |
| Compression by channel | `awareness/compress.ts` (`wearable` → `signal`) |
| Delivery judgment | `awareness/evaluate.ts`, `relevance`, `urgency`, `suppress`, `bundle`, `deliver` |
| Quiet hours | user preferences, honoured by `suppress.ts` and the reminder functions |
| Cross-device context | `VantaContext` persisted in `profiles.preferences.context`, `handoff()` |
| Device class detection | `src/lib/deviceClass.ts` |
| Telegram reminder controls (done / snooze) | `telegram-webhook` |
| Receipts, scope, provenance | `audit_log`, `useScope`, source labels on every reading |

## Plumbing exists, no surface used it yet

- `DeviceClass` was detected but nothing changed behaviour because of it.
- `verbosityForChannel("wearable")` existed with no wearable surface calling it.
- `postureHoldsNoise` / `postureAllowsInteraction` were suppression hints only.
- Attention budget and "recently surfaced" checks lived server-side, never applied
  to a glance-sized surface.

## Built this lap

- `src/lib/deviceCompression.ts` — one set of facts, five bodies, consistency check.
- `src/lib/glance.ts` — the stricter wrist threshold and the wrist-safe action set.
- `src/lib/haptics.ts` — four patterns, quiet-hours aware.
- `/glance` — zero-or-one card, capture, Noted / Remind later / Open on phone.

## Needs UI later

- Wearable connection center rows (heart rate / activity / sleep / workouts with
  method, last reading, consent, history readiness) — the data exists, the grouped
  panel does not.
- `/watch` one-line current priority is in; connection proof per data path is not.

## Needs orchestration later

- Posture suggestion prompt from body signal ("Looks like you're training…").
- Training-mode bundling ("While you were training: 4 things changed. One needs you.").
- Memory-prosthetic timing (right thread, right moment).

## Needs consent review

- Place awareness. Nothing coarse-location driven ships until the consent row,
  the source label and the "approximate stays approximate" rule are all visible.

## Future only

Earbud/voice runtime, glasses, car, ambient room surfaces. Documented, not built.

## Must not build

- A second Vanta brain, memory store, or action store.
- A fifth room.
- Approval on the wrist. Ever.
- Recovery scores, readiness scores, streaks, gamification, diagnosis.
- Continuous listening or continuous location.
- Zeros in place of missing data.
