# Next-Generation Companion Architecture — map before construction

This phase produces the map, not the buildings. Two documents, a handful of tiny seams so future senses can plug in without bolting on new brains, and one recommended next construction phase. No new rooms, no speculative UI, no new connectors.

## 1. Current-state audit

`.lovable/next-generation-companion-audit.md`, written from reading the actual code — every claim traced to a file. Findings sorted into: Already live / Partially implemented / Architectural seam exists / Missing / Intentionally deferred.

Covered: the four rooms and the desks under them, the awareness pipeline (relevance, urgency, suppression, bundling, delivery, resolution, shadow mode, quiet hours), inbound external-platform capture and Camp State detail building, continuity and working memory, scope enforcement, action lifecycle and rollback, receipts, Telegram bridge and delivery channels, Sherlock, capture inputs (voice, files, share target, clipboard), PWA and push, user preferences and brand voice, workspace/multi-user model, and the motion/visual system.

## 2. Architecture document

`.lovable/vanta-next-generation-architecture.md`, organized around four layers:

- **Senses** — what can be perceived. Adapter contract for calendar, email, messaging, files, operational webhooks, documents, device state; future seams (location, movement, battery, connectivity, weather, earbuds, watch, workout, vehicle, NFC, Bluetooth, deliberate camera/mic, environment sensors) documented as plugs, not stubs.
- **Judgment** — one central relevance/urgency/suppression/bundling brain. Adapters supply facts only. No integration ever gets its own alerting path.
- **Presence** — one Vanta core, multiple bodies. Channel compression ladder (desk rich → phone brief → earbuds compressed → wearable signal → ambient cue), cross-device continuity contract, interaction handoffs with no dead ends.
- **Embodiment** — deliberate physical input and friction reducers, with explicit consent per sensor family, derived state over raw telemetry, retention rules, and a hard no-medical-inference line.

Also in the document: the shared cross-device context object (degrades gracefully when fields are unknown), situational posture model (manual first: Training, Deep Work, Driving, Travel, Meeting, Sleep, Quiet, Moving) with Training and Driving worked as reference cases, identity lenses as priority lenses that never touch scope, per-family privacy controls, data minimization table per source, UX laws (no fifth room, compression is the product, silence is valid output), and the seven-chapter roadmap with dependencies.

## 3. Small seams only (low-risk, non-visual)

Enough to stop future bolt-ons, nothing that changes what you see today:

- **Signal source/kind vocabulary** opened up so a new adapter registers itself instead of editing a union in five places, with the existing sources unchanged.
- **A declared `SignalAdapter` contract** matching how the current adapters already behave — formalizing what exists rather than rewriting it.
- **Channel compression seam**: one place that renders a signal at a given verbosity, so the desk/phone/messaging wordings stop being written per-caller. Today's Telegram and Today wording stays byte-identical.
- **Context object type** (scope, project, thread, device class, posture, channel — all optional) declared and covered by tests, unused by UI for now.
- **Posture placeholder** as a typed concept in the context object only. No toggle, no tab, no behavior change yet.

Everything above is types, pure functions, and tests. No migration, no edge function behavior change, no UI change.

## 4. Recommended next phase

The audit closes with the smallest coherent next build. Based on what's already live, the expected recommendation is **Chapter 1, calendar first** — it feeds Today, Work, and Ask through the existing pipeline and needs no new surface — followed by manual posture. That recommendation is stated as a proposal for you to approve separately, not started in this pass.

## Technical notes

- New docs under `.lovable/`; no changes to any `src/` component rendering.
- Seams land in `supabase/functions/_shared/awareness/` (signal vocabulary, adapter contract, compression, context object), mirrored where the client already mirrors shared modules.
- New test cases extend `src/test/awareness-pipeline.test.ts` plus a small context/compression suite; the existing suite must stay green.
- Verification: full test run and a typecheck. No deploys needed since no function behavior changes.
