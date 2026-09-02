# Wearable Companion: one Vanta, many bodies

The wearable layer becomes another body for the same Vanta — not a second product. The wrist whispers, the phone reviews, the desk thinks. Approval never travels.

## What already exists (confirmed by reading the code)

- `VantaContext` with device classes (`desk / phone / wearable / earbuds / vehicle / ambient`) and nine postures, manual with expiry, source recorded.
- A compression module already renders one notice at five verbosities (`rich / brief / signal / spoken / cue`) and maps channels to them.
- Per-sensor consent (`heart_rate`, `activity`, posture inference, device class, calendar, location) with off meaning not read and not stored.
- Real readings: Bluetooth heart rate, phone ingest link, manual entry, daily sweep, sleep/steps/workouts maths, rest-vs-training balance, `/watch` with 14-day bars, nights, 48h heart line, Compare sheet, Today body panel, Work desk body note.
- Nudges with status lifecycle, quiet hours, attention budget, delivery channels.

What does not exist: a glance surface, wrist-safe acknowledge/defer, a haptic vocabulary, a training-mode delivery shift, wrist capture, "Open on phone" continuity, and the written doctrine.

## Wave 1 — Doctrine and audit (documents only)

Write the nine required documents, each grounded in what the code actually does today, with an honest "not built" column:

`vanta-wearable-companion-audit.md`, `vanta-device-compression.md`, `vanta-haptic-language.md`, `vanta-posture-model.md`, `vanta-wrist-experience.md`, `vanta-earbud-experience.md`, `vanta-wearable-connections.md`, `vanta-ambient-intelligence-rules.md`, `vanta-future-glasses-seam.md`.

Glasses, car and home stay documentation only.

## Wave 2 — Glance layer and wrist-safe controls

A glance surface at `/glance` — a real Vanta surface sized like a wrist, not a fifth room and not on the nav. It shows zero or one thing:

```text
  ┌──────────────────────────┐
  │ TRAINING · heart 148     │
  │                          │
  │ Nikki: schedule promised │
  │ today                    │
  │                          │
  │ [ Noted ] [ Later ]      │
  │ [ Open on phone ]        │
  └──────────────────────────┘
```

- One selector picks the single strongest item from records that already exist (due commitment, meeting collision, Sherlock finding, returning deferral). Nothing new is invented.
- Silence is a real state: "Nothing needs you." No filler, no manufactured insight.
- Wrist-safe controls only: Noted (acknowledge), Later (defer with a return time), Open on phone. Approve and Execute are absent — not disabled, absent — and the surface says so in one line.
- Every tap writes a receipt with the device it came from.

## Wave 3 — Body context changes delivery, never decisions

- A single `deliveryPosture()` decision: training or spent shortens copy, holds ordinary items, prefers a cue over a paragraph; critical follows the existing hard rules untouched.
- After training: "While you were training: 4 things changed. One needs you."
- Automatic posture is always a suggestion with Yes / Not now / Always ask. Nothing switches itself on.
- Haptic vocabulary, three patterns only, with a visual equivalent for every one and silence in quiet hours.

## Wave 4 — Continuity and capture

- "Open on phone" restores the same object, scope and thread — no duplicate record, no new Ask thread unless one is needed.
- A deferral made on the glance surface reads back on the phone as "You deferred this from your wrist 18 minutes ago."
- Deliberate wrist capture: press, speak or type, it lands as a draft with time and device source. If it smells like a promise, Vanta says "This sounds like a commitment. Review on phone?" and never converts it silently.

## Wave 5 — Connections and `/watch`

- The wearable card in Connect your world expands into a wearable area: heart rate, daily activity, sleep, workouts, connection method, last reading, consent state, source, history readiness. Brand-neutral, organised by data path (direct sensor / phone health / connected service / manual). Unsupported services are labelled "not connected yet", never implied.
- `/watch` gains a current-priority line, current posture, connection proof and history readiness, and stays a companion surface rather than an analytics dashboard.

## Technical notes

- No new rooms, no second brain, no duplicate memory or action store. The glance surface reads the same tables and the same scope filter as Today.
- Compression reuses `_shared/awareness/compress.ts`; a client mirror keeps wording identical across bodies, verified by tests that compare levels of the same notice.
- Wrist controls map onto existing lifecycles (`nudges.status`, commitment lifecycle) — no new state machine.
- Tests: consent off, missing data as a gap, source labelling per path, compression consistency, no approval or execution from the glance surface, defer and acknowledge, Open-on-phone continuity and scope preservation, posture suggestion never silent, training compression, quiet hours and attention budget suppression, critical gating, insufficient-history wording, reduced motion.
- Validation at 384px, focused tests per slice, then full suite and typecheck.

## Deliberately not built

Native watch or App Store app, continuous listening, glasses, car surfaces, recovery scores, streaks, gamification, any medical claim, any wearable-driven approval.
