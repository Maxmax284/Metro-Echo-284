# Companion pass — unified plan (Today + Awareness + intake)

Plan only. No product code changes.

## Verdict

Vanta already has more of this than expected. Places, a map picker, one-shot honest location, a deterministic relevance/suppression pipeline, image perception separate from OCR, and one shared voice all exist. Three things are genuinely missing: **Today and Awareness don't say a situation** (Today is over-stacked, Awareness is topic-shaped), **Telegram can only receive pictures**, and **nothing knows "near me" from "matters to me"**. The biggest risk is building a second version of something that already exists — this plan forbids that.

## Architectural split (fixed)

```text
SHARED primitives (built once, used by both rooms)
  situation composer · baseline/relevance · Why this? ·
  provenance + freshness · source health · voice rules ·
  response depth · motion tokens

TODAY ONLY (the main cross-project read)
  cross-project ranking · commitments/actions/inbox/security ·
  what changed · body context · Ask entry · resume/handoff

AWARENESS ONLY (inside Work, the deeper place view)
  place strip + pin quality · recenter / fix location / map picker ·
  saved places · eight place topics + explicit Scan · nearby places ·
  trips start/end + mileage history (later) ·
  the Now / Around you / Changed / Coming up shelves
```

Same reasoning, different depth: Today gets one paragraph + ranked lines; Awareness gets one paragraph + four short shelves.

---

## Phase 1 — Today: from twenty-two blocks to one read

Today currently renders ~22 top-level blocks; `SituationRead` — the actual answer — sits seventh, below onboarding and navigation. This phase reorders and folds. It goes first: Today is the main dashboard and establishes the shared visual language Awareness then reuses.

1. **The read leads.** Move `SituationRead` directly under the headline; merge the state headline and the read into one plain-English opening paragraph.
2. **Nothing outranks the answer.** `GotSomethingChooser`, `FirstLapCard`, `JumpStrip`, `CrossDeviceResume` move below the read.
3. **One What changed.** Fold `TodayDigestLine`, `LiveBulletin`, the What changed section, and `ActivityTrace`'s narrative role into a single block. (The trace itself stays — it's decoration, not a duplicate voice.)
4. **One Coming up.** Fold `AgendaStrip` into What's next; one section owns everything upcoming.
5. **One navigation pattern.** Fold `QuickModes` into `JumpStrip`; "start here" stays inside the read only.
6. **One voice ranks the day.** `NoticedRow` stops being a card beside the read; proactive items become ranked lines inside it. The nudge system's own quiet rules (one at a time, attention budget) must hold inside the read's line cap — this is the one real conflict, resolved by keeping proactive lines subject to the same ranking and caps as every other line.
7. **Keep the guarantees.** Every ranked line keeps origin, freshness and Why this? Nothing moves or removes provenance.
8. **One quiet state.** When nothing needs you: the paragraph reads "You're clear." and only the read plus source health show. No filler to avoid whitespace.
9. **Mobile acceptance.** On a 384px screen the paragraph and the ranked lines are visible without scrolling.

Acceptance: ~10 blocks instead of ~22; the answer is the first thing seen; the quiet day is one sentence; all tests and existing line guarantees still pass.

## Phase 2 — Awareness: situational rebuild

- Page opens with **one paragraph**: where you are, what's next, whether anything at this place needs you. Silence is valid: "Nothing worth your attention here."
- Then at most four short shelves — Now / Around you / Changed / Coming up — each 0–3 lines, each line with origin + freshness + Why this?
- The 8 topic chips move below the fold as "Look into this place". Scan stays an explicit tap. Nothing auto-fires.
- Hard cap: one headline, one "start here", nothing else above the fold.
- Built on the shared situation composer — no second relevance engine, no second why-reveal.

## Phase 3 — Place enters the read (shared composer)

Add an optional place input to the shared situation composer.

- Today can open with: "You're at Lamai. Training is next. Nothing urgent needs you before then."
- Place is **words inside the read** — never a card, a map, or a widget.
- Place is mentioned only when ALL hold: location is on; the place is resolved above country level; place actually changed relevance, ordering, or softening. Otherwise Today stays silent about location.
- Place never promotes a signal on its own. It breaks ties and it can soften ("can wait until after training"). Nearby ≠ relevant ≠ worth interrupting.
- When place touched a line, its Why this? says so in words.

## Phase 4 — What Vanta can see

One block (Location, Calendar, Telegram, Wearable, Camera, Microphone) in Awareness or Settings, built from the existing consent, connection and source-health readers — no new toggles. Each row: on/off plus one plain sentence about what it helps with.

## Phase 5 — Object-intent card

One reusable component: "Looks like a receipt." → Read total / File expense / Attach to project / Ask about it. Used by Ask, Inbox, and Telegram (as buttons). Replaces the per-surface custom UX (`AttachmentStrip`, `FileAftermathTray`, `LookAtSheet`, telegram keyboards) at the seam, not by deleting them.

## Phase 6 — Telegram: a real intake door

`telegram-webhook` stops reading pixels itself. It: downloads → uploads to `memory-uploads` → inserts `ingested_files` (`source: "telegram"`) → invokes `files-ingest` (PDF via `unpdf`, DOCX via `mammoth`, images via OCR) → answers in the thread first, Inbox line as a footnote, offers as buttons. Photos keep the caption-intent perception lane (`lookAtImage`) because a question deserves an answer, not a receipt. Unsupported types get a plain "here's what Vanta can take" reply. One pipeline, many doors — no Telegram-specific file system. The existing no-auto-route doctrine for sensitive files holds.

## Phase 7 — Plain-English sweep

- `FileUploadCard.tsx` stops saying "Ingest" and "processing".
- `FileAftermathTray` stops pasting raw `ingested_file_id` into a composer prefill.
- `Glance.tsx` stops saying "sync"; `ReconciliationView` stops saying "signals".
- `askCapabilities.ts` claims "I can transcribe this" for audio with no transcription anywhere — the claim is corrected (removed now, made true in Phase 9).

## Phase 8 — Trips (later)

One small table (`trips`, `trip_points`), deliberate Start trip / End trip with a persistent visible "Trip running" line, distance/duration/stops, a history list, "how far did I ride this week?" Nothing starts on its own; every trip is deletable; an auto-close reports a diff, never silently stops. Lives in Awareness.

## Phase 9 — Voice notes (later)

Opt-in per channel. A voice note arrives as a real object with the words attached. This is the only genuinely new AI capability in the whole pass.

## Never build

- A fifth room; a Location/Map room; a permissions centre.
- A second places table, file table, why-reveal, relevance scorer, or ingestion pipeline.
- Background/continuous location, geofencing, "we followed you all week" recaps.
- Weather integration (`src/lib/weather.ts` is a mood metaphor — keep it that way for this pass).
- Live camera, silent scanning, face recognition. Camera stays deliberate ("Show Vanta something").
- `geohash.ts` stays unwired until there's a stated purpose for cross-user aggregation.

## Risks to hold

- Location becoming the ranker — prevented by the tie-break/soften-only rule in Phase 3.
- A forgotten running trip reads as tracking — visible running state + deletable + auto-close-with-diff.
- Telegram files bypassing sensitivity rules — reuse `files-ingest` doctrines, no new auto-routing.
- Proactive folding into the read — the attention budget still caps proactive lines; when the budget is spent, the day is quiet.

## Build order

1. **Phase 1 (Today hierarchy)** — first; establishes the shared language.
2. **Phase 7 (plain-English sweep)** — cheap, fixes live trust bugs.
3. **Phase 2 (Awareness rebuild)** — reuses what Phase 1 proved.
4. **Phase 3 (place in the composer)** — lands after the Awareness place machinery exists.
5. **Phase 4 (capability visibility)**
6. **Phase 5 (object-intent card)**
7. **Phase 6 (Telegram file lane)**
8. **Phases 8–9 later**, each its own small plan.

No code changed under this plan. Each phase ships with its own acceptance test and a receipt.
