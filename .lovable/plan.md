# Wearable Companion: Doctrine Docs + Wrist Glance Layer

One Vanta, many bodies. This lap writes the wearable doctrine down, then builds the smallest real surface: a wrist glance that usually shows nothing, can capture one thing, and can acknowledge or defer without ever approving.

## Part 1 — The documents

Nine files under `.lovable/`, written in plain talk, each grounded in what the code actually does today:

- `vanta-wearable-companion-audit.md` — every wearable part classified: live (posture, sensor consent, Bluetooth heart rate, phone ingest, manual entry, `/watch`, `/wearable-loop`, `/motion`, Today body panel, Work body line, steps/sleep/workout history, Compare), plumbing-only (device class, cross-device context, quiet hours, attention budget), needs UI, needs orchestration, future only, and must-not-build.
- `vanta-device-compression.md` — one signal, five forms: desktop, phone, wrist, spoken, haptic-only. Compression removes detail, never changes meaning.
- `vanta-haptic-language.md` — four patterns, their meanings, urgency ceilings, suppression and quiet-hours behaviour, accessibility fallbacks.
- `vanta-posture-model.md` — the posture states, where each can come from, and the rule that automatic posture is suggested, never silently applied.
- `vanta-wrist-experience.md` — the glance contract: zero or one card, allowed controls, what is forbidden.
- `vanta-earbud-experience.md` — deliberate voice only, spoken forms of each block type.
- `vanta-wearable-connections.md` — brand-neutral by data path (direct sensor / phone health / connected service / manual), with honest "not connected yet" labelling.
- `vanta-ambient-intelligence-rules.md` — the stricter wrist threshold: urgency, relevance, posture, already-acknowledged, recently-surfaced, material change, quiet hours, attention budget, device fit.
- `vanta-future-glasses-seam.md` — documentation only, no build.

## Part 2 — The compression model in code

A new pure module that takes a signal or item and renders it at four levels plus haptic eligibility. It reuses the existing awareness compression rather than inventing a second one, and it is the single place wrist copy comes from. Fully unit-tested for consistency: the wrist form never says something the desktop form does not.

## Part 3 — The glance surface

A new route sized like a wrist, testable on your phone at 384px and installable:

- **One thing, or nothing.** The strongest signal only, chosen by the stricter wrist threshold. When nothing passes: "Nothing needs you." That is a success state, not an empty state.
- **Proof line.** Posture, connection freshness, and source, in mono micro-labels.
- **Body line.** One short honest line from the existing wearable helpers. Missing data reads as a gap, never a zero.
- **Controls, and only these:** Noted · Remind later · Open on phone. Each labelled so it is obvious none of them is approval. Mark done appears only where an existing narrow lifecycle rule already allows it.
- **Capture.** One deliberate tap opens a small capture. It lands as a draft with time, device source, and provenance. If it smells like a promise, Vanta says so and offers review on the phone — it does not silently create a commitment.
- **Haptics.** The four-pattern vocabulary, quiet-hours aware, reduced-motion respected.
- **Hand-off.** Defer and Noted write real events, so the phone can later say "you deferred this from your wrist 18 minutes ago" against the same object, same scope, same thread. Approval never travels.

Linked from `/wearable-loop` and `/watch`. `/watch` gains a one-line current priority and connection proof, and stays a companion surface — not a dashboard.

## Not in this lap

Earbud voice runtime, place awareness, memory-prosthetic timing, training mode automation, glasses, car and home surfaces. All documented, none built.

## Technical notes

- New: `src/lib/deviceCompression.ts`, `src/lib/haptics.ts`, `src/lib/glance.ts` (selection + threshold, pure), `src/pages/Glance.tsx`, a few small components under `src/components/glance/`.
- Reuses: `useWearableLoop`, `src/lib/wearable.ts`, `VantaContextProvider` posture, `detectDeviceClass`, nudges, `useScope`, existing quiet-hours prefs. No new tables, no new edge functions, no second brain.
- Tests: compression consistency, wrist-safe action set (no approve/execute), consent off, missing-data gaps, source labelling, quiet-hours and budget suppression, defer continuity, reduced motion, 384px layout.
