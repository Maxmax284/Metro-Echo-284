# Real watch data: readings, a sweep, a loop page, and a Today panel

Right now the Wearables page explains posture and consent in words only. Nothing on
it has ever read a watch. This plan gives it real numbers, a place to store them, a
sweep that reports a diff, and one panel in Today — same shape as the Telegram loop,
same laws: a watch feeds Vanta, it never approves or runs anything.

## What can honestly read a watch here

Two real paths, both truthful about their limits:

- **Live heart rate over Bluetooth.** Chest straps and most watches broadcast heart
  rate on a standard Bluetooth channel. Vanta can ask your permission, connect, and
  read beats per minute live. This works in Chrome on Android and desktop; it does
  not work in Safari or on iPhone, and the panel will say so plainly instead of
  showing a dead button.
- **Steps, sleep and workouts by hand-off.** Apple Watch and Fitbit do not let a web
  app read health history. Those arrive through a private ingest link you paste into
  an Apple Shortcut or Health Auto Export on your phone, which posts your daily
  numbers to Vanta on a schedule you choose. No password, no account sharing.

Anything the browser cannot see stays labelled "not connected". No fake numbers, no
estimates presented as readings.

## 1. A place for readings

A new `wearable_readings` table: one row per reading, with the kind (heart rate,
steps, sleep, workout), the value, the time it was measured, where it came from
(bluetooth or the ingest link), and the scope it belongs to. Locked to you by row
level security. Nothing is written unless the matching sensor consent is on.

## 2. The watch feed panel, with numbers

The existing panel on Wearables gets three real rows instead of prose:

- **Heart rate** — a Connect button when Bluetooth is available, live BPM once
  connected, and the last recorded reading otherwise.
- **Steps today** — today's count from the ingest link, with the time it arrived,
  or a line explaining how to set the link up.
- **Posture** — what you set by hand, plus, if the numbers disagree loudly (say
  a workout heart rate while you are marked "at desk"), a suggestion you can accept.
  Vanta never switches posture by itself.

Posture and consent stay the two switches that govern all of it: a sensor that is
off produces nothing, and its row says "off" rather than "no data".

## 3. A daily wearable sweep

A new `wearable-sweep` job, built exactly like the page sweep: single-flight,
scoped per person, and it reports a diff, never a status — "Yesterday 06:10 — 1,412
steps, 22 heart-rate readings, 6h 40m sleep" or "nothing new from your watch". A
**Read now** button runs it on demand so nothing waits on the nightly run. Each run
leaves one receipt whose payload holds the counts.

## 4. The wearable loop page

`/wearable-loop`, the twin of the paper-and-phone page: the connection line, the
sync line with Read now, and a five-step walk that ticks only on recorded evidence:

```text
1. Watch connected        a reading exists, with its source named
2. Numbers arrived        today's readings landed, with the time
3. Posture known          a posture is set, manual or accepted
4. Vanta adjusted         a note held or surfaced because of posture
5. It shows in Today      the wearable panel reads it back
```

Nothing on that page writes state except the read.

## 5. The Today panel

A collapsible **Your body** panel in Today, folded by default, with one summary
line: heart rate if live, steps if known, posture, and the last sync. It links to
the loop page for detail. When no sensor is on it teaches instead of reporting
emptiness — one line on how to switch one on.

## Technical notes

- Migration: `wearable_readings` (id, user_id, organization_id, kind, value numeric,
  unit, measured_at, source, raw jsonb, created_at), GRANTs for `authenticated` and
  `service_role`, RLS scoped by `auth.uid()` plus org membership, unique on
  (user_id, kind, measured_at, source) for idempotent re-ingest.
- New `src/lib/wearable.ts`: pure helpers — reading summaries, sweep diff wording
  (including the empty diff), posture-suggestion rules, and walk-step resolution.
  Unit tested in `src/test/wearable.test.ts`.
- New `src/lib/wearableBluetooth.ts`: Web Bluetooth heart-rate service `0x180D`,
  characteristic `0x2A37`, availability probe via `navigator.bluetooth`, user
  gesture only, disconnect on unmount. Readings written through the client with
  consent checked first.
- New edge functions: `wearable-ingest` (`verify_jwt = false`, a per-user token
  from `integration_webhook_secrets`, validated body, upsert readings, audit
  `wearable.ingest`) and `wearable-sweep` (uses `job_leases`, writes one
  `wearable.sweep` audit event holding the diff, scheduled daily by `pg_cron`).
- New `src/hooks/useWearableLoop.ts` mirroring `usePhysicalLoop`, all queries
  through `applyScope`.
- New components: `WearableReadings.tsx`, `WearableSyncLine.tsx`, `WearableWalk.tsx`
  under `src/components/wearables/`, plus `TodayBodyPanel.tsx` under
  `src/components/today/`. Existing `WearableContextPanel` composes the first two.
- New page `src/pages/WearableLoop.tsx` on `/wearable-loop`, linked from Wearables
  and from Settings → Awareness and senses.
- Two new sensor keys — `heart_rate` and `activity` — added to the consent list so
  each is opted into on its own. Off by default, off means nothing is read.
- Copy through `vantaNouns` / `roomCopy`, toasts via `vantaToast`, states via
  `state-views`, cards use `.vanta-card`, validated at 384px.
