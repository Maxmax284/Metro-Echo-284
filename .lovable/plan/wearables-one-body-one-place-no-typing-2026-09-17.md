# Wearables: one body, one place, no typing

Your phone already collects everything your wearables produce. Metro Echo's job is to
receive it automatically, read it back as patterns, and let the rest of the platform use it —
without becoming a separate health app.

## What exists today (verified in the live code)

- A private hand-off address per person (`wearable-link` mints the token, `wearable-ingest`
  stores readings). Anything that can post JSON on a schedule already works — no typing needed.
- Readings land in one pool. Today's "Your body" panel, the Work body line, the Body desk
  and the trends page all read that same pool. Nothing is duplicated.
- 14 days of patterns already computed: steps by day, sleep by night, heart-rate line,
  workouts, and this-week-vs-usual comparison. It lives on a page most people never find.
- A daily sweep that reports a diff ("nothing new from your watch" is a real answer).

## The real gaps

1. **Only five kinds are accepted** (heart rate, steps, sleep, workout, stand). Resting heart
   rate, HRV, oxygen, calories, weight and body fat from the phone are dropped at the door.
2. **Nothing tells you how to make the phone push automatically.** The link page has a test
   button, which reads like "type it by hand". It never explains the one-time phone setup.
3. **The patterns page is buried** at a "how it works" address, not in Work.
4. **No body profile.** Echo has numbers with no idea whose they are — age band, build,
   athlete or everyday, sleep habit, training days.
5. **One on/off switch** covers steps, sleep and workouts together. Too blunt.

## What to build

### 1. Open the door wider
Accept the kinds a phone actually exports: resting heart rate, HRV, oxygen saturation,
respiratory rate, active energy, weight, body fat, blood pressure and cycling/running
distance — alongside what's already accepted. Same idempotent behaviour, same consent gate,
same "unusable readings are refused plainly". No vendor is contacted; the phone pushes.

### 2. Make the phone push by itself (both platforms, no store needed)
Rebuild the link page as a setup page that gives you, per platform, a copy-ready address and
token plus the exact one-time steps:
- **iPhone** — Health Auto Export or a Shortcuts automation posting on a schedule or on new data.
- **Android** — Health Connect export via an automation app posting to the same address.
Add a live "last arrival" line, a "rotate this address" control, and an honest statement that
a device can send readings and nothing else. No approval ever travels to a wrist.

### 3. Native Health read — seam only, not built
Note the second path plainly on that page: an installed Metro Echo app reading Apple Health
and Health Connect directly, no export tool. It needs the native shell, health permissions
and store review, so it stays a documented seam until you want it. Nothing pretends to be live.

### 4. Body profile (context, never a verdict)
A short profile you fill once: age band, height and build, everyday or athlete, main activity,
sleep habit, usual training days, things you'd want Echo to keep in mind. Used only to phrase
what Echo says and to know what your normal looks like. No thresholds, no scores, no
good/bad, no advice — the standing body disclaimer keeps its place.

### 5. The dashboard — hybrid, as agreed
- **Body desk in Work** becomes the front page: what arrived and when, this week against your
  usual, heart / sleep / activity trend strips, workouts, your profile, medication, and the
  device link at the top. Built from the components already in use (cards, trend strips,
  compare rows, collapsible sections) — mobile first, one column at 384px.
- **The trends page stays** as the deeper read behind it: longer history, day-by-day detail,
  each reading with its source and stamp.
- **Today keeps its short panel**, unchanged in spirit: quiet, folded, one line worth reading.

### 6. Easy to find, on both screens
- Work "Go straight there" keeps a **Body** tile and gains a **Wearables** tile pointing at
  setup, so linking a device is never a scavenger hunt.
- Today's body panel links to the Body desk and to setup.
- A home-screen shortcut for Body on the phone, using the shortcuts already in the manifest.

### 7. Wired into the rest of the platform, not bolted on
Readings feed the systems that already exist, and nothing new:
- **Judgment substrate** — energy and rest become a friction input, so "cheapest, fastest,
  least hassle" can account for a night of four hours' sleep, and travel days know the clock shift.
- **Rhythm** — training days and recurring sessions join the routine layer, with the same
  28-day decay. Never inferred from covert tracking; only from your calendar and your own words.
- **Awareness** — one opt-in, quiet-hours-respecting observation when a 3-day window drifts
  from the 14-day baseline. It reports what changed. Never a verdict, never escalation.
- **Ask and Telegram** — "how did I sleep this week", "what's my average heart rate",
  "am I training more than usual" answered from records only, with source and stamp.
- **Flights, Schedule, Money, Housing, Local help** stay the owners of their own domains; body
  context only colours how Echo talks about them.

## Explicitly not building

No Health room, tab or mode. No diagnosis, scoring, targets or advice. No always-on sensing,
no background location, no covert habit inference. No vendor API polling. No native rewrite.
Nothing on a wearable can approve anything.

## Technical notes

- `wearable-ingest`: widen the accepted-kind list with units, keep the upsert conflict key, keep
  the consent refusal, and split consent into body-basics / activity / sleep in `sensor_consent`.
- Body profile stored in `profiles.preferences.body_profile` — no new table, no scope leak.
- Reuse `useWearableTrends` and `src/lib/wearable.ts` for all maths; new sentences go there so
  page, panel, Ask and Telegram agree. No second calculator.
- New pure module for body-derived friction and rhythm inputs under
  `supabase/functions/_shared/judgment/`, mirrored client-side like the others.
- Tests: kind acceptance and refusal, consent split, profile phrasing, trend maths with gaps,
  drift observation with quiet hours, Ask and Telegram answers, 384px and 1440px layout.

## Order

1. Ingest widening plus consent split.
2. Setup page that makes the phone push, both platforms, with native seam documented.
3. Body profile.
4. Body desk dashboard, trends page kept behind it, tiles and shortcut.
5. Platform wiring: friction, rhythm, awareness observation, Ask and Telegram answers.
6. Full suite, typecheck, mobile and desktop pass.
