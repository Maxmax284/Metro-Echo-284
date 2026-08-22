# Vanta — Next-Generation Companion Architecture

The map before the next construction phase. Companion to `.lovable/next-generation-companion-audit.md`, which records what is actually live today.

Governing sentence: **more capability underneath, less complexity on top.** Vanta gains senses without gaining ego.

Standing laws, unchanged by anything in this document:

- Capture never executes.
- Plan → Approve → Execute → Receipt.
- Messaging feeds the system; it does not control it.
- Scope is a boundary, not a filter.
- Vanta earns interruptions.
- Complexity reveals itself only when requested.
- Silence is a valid output.

---

## 1. Baseline

Four rooms (Today / Work / Ask / Receipts) with desks underneath. A deterministic awareness pipeline — signal → relevance → urgency → suppression → bundling → delivery → resolution. Live channels: Today, Telegram, push. Inbound external platforms write captures and may earn an immediate notice. Actions are approved by a human and leave receipts. Scope is enforced at query and dedupe level.

That baseline is the foundation. Nothing below replaces it; everything below plugs into it.

---

## 2. The four layers

Every future capability belongs to one or more:

```text
   SENSES        what the world can tell Vanta
      |
   JUDGMENT      what actually matters (one brain, always central)
      |
   PRESENCE      which body says it, and how little it says
      |
   EMBODIMENT    physical context and friction reducers
```

A capability that skips a layer is a bug in the design, not a shortcut.

---

## 3. Senses

### 3.1 The adapter contract

```ts
interface SignalAdapter<T> {
  source: SignalSource;
  normalize(input: T, scope: ScopeIdentity, now: number): AwarenessSignal[];
}
```

Lives in `_shared/awareness/signal.ts` and is already how every live adapter behaves. An adapter:

- supplies **facts only** — summary, why, next step, source refs, confidence;
- registers its kinds and one `baseImpact` weight in `_shared/awareness/registry.ts`;
- returns nothing when there is nothing (an adapter that always produces output is broken);
- **never** sets urgency, picks a channel, sends anything, or writes a nudge.

Registration is the whole extension surface:

```ts
registerSignalKind({ kind: "calendar_conflict", source: "calendar", baseImpact: 0.65 });
```

Unregistered kinds score quiet, never loud.

### 3.2 Priority bridges (Chapter 1)

| Sense | Useful context it buys | Feeds |
| --- | --- | --- |
| Calendar | timing, travel risk, meeting-shaped days, "what's next" | Today, Work, Ask |
| Email | commitments made, project threads, unread risk | Work, Today, Ask |
| Messaging | intake, operational threads, drafts | Work, Ask, Today |
| Files | project material, continuity, document review | Work, Ask |
| Operational systems (Camp State, CampCore, Fenrir) | real-world events with money and people attached | Today, Work |

Each is an adapter. None gets a room. None gets a dashboard.

### 3.3 Future sense seams (documented plugs, not stubs)

Coarse location · movement state · battery · connectivity · weather · active device · earbuds present · watch · workout state · wearable telemetry · vehicle state · Bluetooth · NFC · deliberate camera · deliberate microphone · environment sensors · specialized equipment.

Each arrives as: a registered kind, a normalize function, a consent switch, and a retention rule. If it cannot answer *"what context does this buy that improves continuity, awareness, timing, or decision support?"*, it does not ship.

### 3.4 Data minimization

Store derived state, not raw streams:

| Instead of | Store |
| --- | --- |
| heart-rate samples | "training session active" |
| battery history | "phone battery low" |
| location trail | "in transit" / coarse label |
| audio | the transcript the user approved |

Per source, decide before building: what raw data is required, what becomes derived state, how long it lives, which scope owns it, whether it may enter AI context. Default to less.

---

## 4. Judgment

One brain. Adapters never grow their own.

Existing stages stay: relevance (six grounded factors, confidence multiplies), urgency (five rungs, `critical` is a whitelist), suppression (including attention budget), bundling, resolution recheck.

Future inputs the judgment layer may combine — all optional, all inspectable:

scope · active project · unresolved obligations · user corrections · recent activity · source confidence · device class · posture · coarse location (only if enabled) · wearable context (only if enabled) · already-acknowledged state · recent interruption frequency.

Goal restated: not "Vanta knows everything" but **"Vanta knows which two things matter out of twenty-two."**

### Hard rule — no direct integration-to-notification path

```text
calendar / email / wearable / location / webhook / camera
        |
        v
   normalize (facts only)
        |
        v
 relevance -> urgency -> suppression -> bundling -> compression
        |
        v
      Today  (then, maybe, a second narrower channel)
```

A calendar event may not alert. A wearable reading may not interrupt. An email may not create an action. Location may not trigger execution. Ever.

### Adaptive attention (Chapter 7)

Learn only from explicit behaviour: dismissals, corrections, snoozes, approvals, pins, repeated actions, timing. Every learned weight must be visible in plain English and correctable ("you usually handle this after training"). No personality inference, no sensitive-trait modelling, no engagement optimisation.

---

## 5. Presence

One core, multiple bodies. Bodies share scope, continuity, memory, current thread, urgency, corrections, receipts, preferences. No device gets its own Vanta.

### 5.1 Compression ladder

`_shared/awareness/compress.ts` — one signal, one set of facts, five verbosities:

| Verbosity | Channel | Contents |
| --- | --- | --- |
| `rich` | desk / Today | headline, every fact, next step, source links |
| `brief` | phone, messaging | headline, facts, next step, open-Vanta line |
| `signal` | wearable | headline plus at most one fact |
| `spoken` | earbuds / voice | one sentence, offers the rest instead of dumping it |
| `cue` | ambient | "One thing changed." |

Rule: **the smaller or more interruptive the channel, the less Vanta says.** Facts are dropped from the tail, never invented and never rewritten. Every caller that speaks to a channel goes through this module, so no wording is retyped per call site.

### 5.2 Cross-device continuity

`_shared/awareness/context.ts` declares the shared context object:

scope · projectId · threadId · unresolvedQuestion · sourceRefs · pendingActionId · deviceClass · lastDeviceClass · lastChannel · lastSeenAt · posture · postureSource · lens · coarse location · moving · quietHours · earbudsPresent · wearablePresent.

Every field optional. `mergeContext()` never lets `undefined` erase known state — an unaware device must not blank the thread a knowing device established. `handoff()` records the body we came from.

The thread travels:

```text
earbuds: "what changed with Camp State?"  ->  spoken one-liner
   later, desk opens                      ->  "Continue from earlier? Camp State · 22m ago"
```

One continuity model, no per-device memory silo. A pending approval never resolves because the user switched devices.

### 5.3 Handoffs, no dead ends

wearable tap → phone opens the exact context · earbuds "show me later" → desk Today carries it · Today → Work project · Ask → open source → document · receipt → originating action. Nothing ever requires re-searching.

---

## 6. Situational posture

`Posture`: at_desk · deep_work · meeting · training · driving · travel · moving · quiet · sleep.

**Manual first.** `postureSource` records `manual | suggested | inferred | unknown`; when confidence is uncertain Vanta *suggests* a posture rather than assuming one. Posture changes Vanta's behaviour, never its navigation — no Training tab, no Driving room.

Posture feeds judgment as a suppression hint (`postureHoldsNoise`) and gates interaction shape (`postureAllowsInteraction`). It can never silence `critical`.

### Reference case — Training

Start: suppress normal work noise, hold non-urgent communication, allow only truly urgent interruption, keep dictated capture available, preserve training context, optionally consume workout state later.
End: "Two things came in. Neither was urgent." → Review · Ask Vanta · Resume previous work.

### Reference case — Driving

Voice-first, extremely concise, low-priority suppressed, travel-relevant items eligible, no approval UI while moving: *"An approval is waiting. I'll hold it until you stop."*

### Sleep

Near-total silence. Critical only, and critical stays rare by construction.

---

## 7. Identity lenses

Personal · Operator · Trainer · Developer · Owner. Situational priority lenses that reorder what surfaces first **within** what the user may already see. Not accounts. Not permissions. Scope stays the hard boundary underneath, unchanged and unweakened.

---

## 8. Embodiment

Deliberate input only.

- **Camera** — "Vanta, look at this": document, receipt, equipment, sign, whiteboard, schedule, damage. Output: extract, summarize, classify, attach to project, draft, follow-up. Explicit access every time. No passive surveillance.
- **Microphone / meeting capture** — manual start, explicit consent, transcribe, extract decisions and commitments, associate to projects, prepare follow-ups, human reviews. Nothing executes. No always-on listening.
- **Friction reducers** — NFC tag on the gym bag suggests Training posture; desk tag resumes Work context; watch complication, lock-screen widget, vehicle interface, smart display. Only where they remove a step. No hardware theatre.

Physical input obeys the same doctrine as digital: capture → understand → associate → judge → surface if useful → prepare if asked → human approves → execute → receipt.

---

## 9. Wearables and telemetry

Context, not diagnosis. Per-family opt-in, derived state preferred, explicit retention.

Allowed: "your heart rate stayed above your configured training range longer than usual."
Forbidden: any medical conclusion, condition inference, or health advice. Health-specific functionality, if ever proposed, is a separately governed domain.

---

## 10. Privacy and consent

One switch per family — calendar, email, files, location, device context, wearable telemetry, camera, microphone, training state, vehicle, home/environment. Never one giant allow-everything toggle. Each switch states in plain English what it lets Vanta see and what it does not.

---

## 11. UX laws

1. **No fifth room.** Every new capability feeds Today / Work / Ask / Receipts. If a capability seems to need its own room, the architecture is wrong.
2. **Compression is the product.** Twelve signals, four projects, three deadlines, two security events and one wearable alert render as "Two things need you." — or "Quiet right now."
3. **Hierarchy, always in this order:** what state am I in → what matters → what can I do → where can I drill deeper.
4. **Ask is the pressure-release valve.** "Show me everything related to this", "why are you showing me this", "what changed", "open the source", "what did we decide" — Ask reveals existing interfaces instead of spawning new navigation.
5. **Vanta does not show everything it knows.** More sources must not mean a denser first screen.
6. **Visual cohesion.** One typography, motion vocabulary, semantic palette, card grammar and state components across rooms. Today calm, Work structured, Ask spacious, Receipts factual — one product.
7. **Street-tech identity.** Custom, calm, sharp, tactile, slightly industrial, alive when state changes. No sci-fi cosplay, no hologram dashboards, no neon, no "system online".
8. **Presence without nagging.** "Nothing needs you." / "Two things came in. Neither was urgent." / "Still waiting." No tips, no insight spam, no fake thinking theater.

---

## 12. Chapter roadmap

| Chapter | Scope | Depends on |
| --- | --- | --- |
| 1 — Signal bridges | calendar, email, messaging, files, operational systems | registry + adapter contract (done) |
| 2 — Cross-device continuity | persisted context record, thread travel, resume prompts | context object (declared) |
| 3 — Situational posture | manual Training / Driving / Deep Work / Travel / Meeting / Sleep | posture type (declared), Chapter 2 for device class |
| 4 — Voice & ambient | compressed spoken output, voice-in, ambient cue | compression ladder (done), Chapter 3 |
| 5 — Physical sensing | camera, NFC, Bluetooth, deliberate environment input | per-family consent, Chapter 3 |
| 6 — Wearables & telemetry | workout, heart rate, recovery, device state | Chapters 3 and 5, retention rules |
| 7 — Adaptive attention | learn priority from corrections and behaviour | enough history from Chapters 1–3 |

Implementation order: validate current proactive awareness → Chapter 1 (calendar first) → Chapter 2 primitives → Chapter 3 manual posture → Chapter 4 → Chapter 5 → Chapter 6 → Chapter 7. Do not run chapters in parallel.

---

## 13. Definition of done for this phase

- More signal sources can plug in without creating new brains — `registry.ts` + `SignalAdapter`.
- Judgment stays centralized — no integration can reach a channel directly.
- Scope stays absolute — signal identity remains scope-segmented.
- Interruptions stay earned — urgency ladder, suppression, attention budget, quiet hours untouched.
- Cross-device communication has one continuity model — `VantaContext`.
- Device-specific output is compressed by one module — `compress.ts`.
- Physical sensors remain deliberate and permissioned — documented, not stubbed.
- Wearable telemetry is contextual, never diagnostic.
- Every future capability fits the four rooms.

Final philosophy: **senses expand, judgment filters, presence adapts, embodiment reduces friction** — and through all of it, Vanta holds the thread so the user does not have to.
