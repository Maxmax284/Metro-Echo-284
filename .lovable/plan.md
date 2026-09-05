# Companion pass — audit and build order

Audit only. No code changed.

## Verdict in plain words

Vanta already has more of this than expected. Places, a map picker, one-shot location with honest precision tiers, source health, a deterministic relevance/suppression pipeline, an image-perception path separate from OCR, and a shared voice layer all exist today.

Three things are genuinely missing:
1. Awareness doesn't say a **situation**. It says eight topics and a scan button.
2. Telegram can only receive **pictures**. PDFs, Word files and voice notes bounce.
3. Nothing knows the difference between **near me** and **matters to me**.

Everything else on the list is either already built, or a rename away from built. The biggest risk in this pass is not missing capability — it is adding a second version of something that already exists.

---

## 1. What exists and should be reused

**Place and location (more than expected)**
- `awareness_places` table (label, `geo` jsonb, country/region) — this *is* the saved-places table, multi-place, switchable.
- `src/lib/awarenessLocation.ts` — five honest axes (device location, place status, pin quality, scan status, advisor mode) plus a one-line status message and source badges. Already the "Location on / using current location / off" logic.
- `src/lib/locationSanity.ts` — bounded high-accuracy sampling (clears its own watch), haversine `distMeters`, bad-pin classification, Nominatim search.
- `MapPickerDialog.tsx` — Leaflet map, pin drop, reverse geocode, apply as place.
- `BadLocationRecoveryPanel.tsx` — last good place / recenter / pick on map / nearby chips.
- `awareness-geocode`, `awareness-nearby-places` (OSM Nominatim + Overpass, cached). No Google/Mapbox, no keys.
- `src/lib/native.ts` — Capacitor/browser one-shot position.
- No background tracking anywhere. Four call sites, all one-shot or bounded.

**Relevance machinery (the hard part is done)**
- `_shared/awareness/`: `registry` (impact per kind) → `relevance` (weighted score) → `urgency` → `suppress` (cooldown, quiet hours, attention budget) → `bundle`. Mirrored to the client via `src/lib/awareness/index.ts`.
- `src/lib/baseline.ts`, `drift.ts`, `_shared/situation.ts` + `useSituation` — the Today read with ranked lines, origin, freshness.
- `_shared/whySurfaced.ts` + `why-surfaced.tsx` — the universal "Why this?" reveal, already on Today, Sherlock, Awareness rows and Telegram.
- `src/lib/sourceHealth.ts` + `SourceHealthStrip.tsx` — sources with nothing to say, named once.

**Perception vs OCR — already two things**
- `_shared/pageRead.ts` (`ocrImage`) = "what text is here?"
- `_shared/lookAt.ts` (`lookAtImage`, five intents: identify / unusual / text / promises / amount) = "what am I looking at?" Live in Ask (`LookAtSheet`), in `perception-look`, and in Telegram captions.
- Both use the same gateway vision model. **Ordinary-image understanding already works today.** No new model work.

**Ingestion**
- One table (`ingested_files`), one bucket (`memory-uploads`), one extractor (`files-ingest`: images via OCR, PDF via `unpdf`, DOCX via `mammoth`).

**Capability visibility (already ~70% there)**
- `SensorConsentSection`, `DeviceSignalsSection`, `ConnectYourWorldSection`, `EcosystemSourcesPanel`, `SystemHealthLine`, `SourceStatusPill`, `telegram-status`.

**Voice**
- `plainEnglish.ts`, `plainLabels.ts`, `awarenessPlainTalk.ts`, `vantaVoice.ts`, `brandVoice.ts`, `responseDepth.ts` — one voice, one depth law.

## 2. Partial

- **Awareness surface** — one long stack: place strip, recovery panel, scan button, radar, attention queue, 8 fixed topic chips, places list. Topic-shaped, not situation-shaped. It lives inside Work (`navigation.ts`), which is correct — no fifth room needed.
- **Telegram intake** — text, photos, image-mime documents, button taps. PDFs, Word, voice, audio, video, stickers all fall to "text only". Photos bypass `files-ingest`, so they skip classification.
- **Trips** — `distMeters` exists; nothing records a journey.
- **`geohash.ts`** — written, wired to nothing.
- **`askCapabilities.ts`** claims "I can transcribe this" for audio. There is no transcription anywhere. That is a false promise in the UI and should be corrected either way.
- **Plain English leaks** — `FileUploadCard.tsx` says "Ingest" and "processing"; `FileAftermathTray` pastes a raw `ingested_file_id` into a composer prefill; `Glance.tsx` says "sync"; `ReconciliationView` says "signals".
- **Weather** — `src/lib/weather.ts` is a mood metaphor from overdue counts, not weather. Real weather would be a new outside source; low value, keep out of this pass.

## 3. Genuinely new work

- A **situation composer** for Awareness: Now / Around you / Changed / Coming up, assembled from place + agenda + commitments + source health + device, capped hard.
- **Place relevance**: attach an optional place to signals and let it act as a *tie-breaker and softener*, never a ranker.
- **Trips**: one small table (`trips`, `trip_points`) plus deliberate Start/End and a distance summary. Bones only.
- **Telegram file lane**: accept `document` of any supported mime plus `voice`/`audio`, and route through `files-ingest` instead of inline OCR.
- **Voice notes** need a transcription step — the only real new AI capability on the list.
- **One object-intent card**: "Looks like a receipt." + the same 3-4 offers, used by Ask, Inbox and Telegram (Telegram renders it as buttons).

## 4. Do not build

- A fifth room, a Location room, a Map room, a permissions centre.
- A second places table, a second file table, a "Telegram PDF" path, a Telegram-only vision call.
- Background/continuous location, geofencing, "we followed you all week" recaps.
- A second why-reveal, a second source-health widget, a second relevance scorer, weather integration, face recognition, live camera.

## 5. Does Awareness need a rebuild?

Yes — but a **replacement of the top of the page, not the pipeline**. Smallest redesign:

- Page opens with **one paragraph**: where you are, what's next, whether anything at this place needs you. Silence allowed: "Nothing worth your attention here."
- Then at most four short shelves — Now / Around you / Changed / Coming up — each holding **0-3 lines**, each line with origin + freshness + Why this?
- The 8 topic chips move **below** the fold as "Look into this place" — they stay, they stop being the headline.
- Scan stays an explicit tap. Nothing auto-fires.
- Hard cap: one headline, one "start here", nothing else above the fold.

## 6. How Telegram multimodal should plug in

`telegram-webhook` stops reading pixels itself. It: downloads → uploads to `memory-uploads` → inserts `ingested_files` with `source: "telegram"` → invokes `files-ingest` → replies from the result in the thread (answer first, Inbox line as a footnote, buttons for the offers). Photos keep the caption-intent perception lane, because a question deserves an answer, not a filing receipt. One pipeline, many doors.

## 7. Location staging (safe order)

1. **Read-only place context** — reuse the active place; show "You're at Lamai" in the situation line; explain when place changed a suggestion.
2. **Place-aware softening** — place never promotes; it can break ties and it can *delay* ("can wait until after training").
3. **Trips** — explicit Start/End, distance and duration, a history list, "how much did I ride this week?" Nothing starts on its own; ending is always possible; a trip is deletable.
4. **Mileage/answers over trip history** — last.

Every step keeps: visible state, opt-in, no silent background fix, and a receipt.

## 8. Hidden risks

- Location becoming the ranker (café spam). Fixed by rule 2 above.
- A trip left running looks like tracking — needs a persistent visible "Trip running" line and an auto-close with a diff, not a silent stop.
- Routing files through `files-ingest` from Telegram means a sensitive document could get auto-classified; the existing no-auto-route doctrine must hold.
- Voice notes are the most invasive intake — keep them opt-in per channel.
- `geohash.ts` is a cross-user aggregation seam. Leave it dead until there's a stated purpose.
- The false "I can transcribe this" label is a trust bug today.

## 9. Build order with acceptance criteria

**A. Awareness situation read** — page opens with one plain paragraph and ≤4 shelves; every line has origin, freshness, Why this?; empty state reads "Nothing worth your attention here."; topic chips still reachable below.

**B. What Vanta can see** — one block (Location, Calendar, Telegram, Wearable, Camera, Microphone) built from the existing consent/connection/health readers; each row reads on/off plus one sentence of why it helps; no new toggles invented.

**C. Object-intent card** — one component; a receipt, a whiteboard and a contract each show a "Looks like…" line and the same shaped offers; Ask, Inbox and Telegram all use it; nothing runs without a tap.

**D. Telegram file lane** — a PDF and a Word file sent to the bot land as real objects via `files-ingest` and get an answer in the thread; unsupported types say plainly what Vanta can take.

**E. Place-aware softening** — a signal can carry a place; being at the place changes ordering only within a tier and can add "can wait until after"; removing place changes nothing structurally.

**F. Plain-English sweep** — "Ingest", "processing", "sync", "signals", raw ids removed from user-facing copy; audio capability claim made true or removed.

**G. Trips** — Start/End trip with a visible running state; distance, duration, stops; a history list; "how far did I ride this week?" answerable; deletable.

**H. Voice notes** — opt-in transcription, arrives as a real object with the words attached.

---

# Addendum — does Today need to change too?

Yes, but not by adding. Today is the room that needs **less**, arranged better.

## What Today already has (and it's a lot)

Read off `TodaySurface.tsx` in render order: header + one-line state headline (`todayHeadline`/`stateOfDay`), time-source line, 14-day activity trace, tick row, `GotSomethingChooser`, `FirstLapCard`, `JumpStrip`, `CrossDeviceResume`, **`SituationRead`**, `SourceHealthStrip`, `TodayDigestLine`, `AskVantaBar`, `QuickModes`, `LiveBulletin`, `NoticedRow`, `ResumeWorkSection`, `AgendaStrip`, `TodayBodyPanel`, then sections Needs attention / What's next / Security / What changed / Fresh in, then `SurfaceAftermath`.

Supporting the companion direction already:
- **The one read** — `SituationRead` with ranked lines, origin, freshness, Why this? on every line, and a "start here".
- **Source health** — `SourceHealthStrip`, sources with nothing to say named once.
- **Body/device** — `TodayBodyPanel`.
- **Coming up** — `AgendaStrip` (calendar) + What's next (dated promises).
- **Changed** — `LiveBulletin` + What changed.
- **Proactive** — `NoticedRow` with dismiss/follow.
- **Provenance and honesty** — `TimeSourceLine`, `FreshnessLine`, `CardMeta`, `ActivityTrace`, `ExplainThisButton`.

## What's actually missing

1. **Place.** `_shared/situation.ts` has no place input at all. Today cannot say "You're at Lamai."
2. **Hierarchy.** Around twenty-two top-level blocks. The read is seventh. Four separate things answer "what changed" and two answer "coming up".
3. **One sentence.** The headline is a state label; the read is a separate card. They don't compose into a paragraph a person can absorb in one look.

Not "underpowered" — over-stacked. Adding cards would make it worse.

## Answers

**3) Should place surface in Today?** Yes — but as *words inside the read*, never a card, never a map. One clause in the opening sentence, and only when all three hold: location is on, the place is resolved above country level, and the place changed something (ordering, or a "can wait until after"). Otherwise Today says nothing about location at all. No pin, no coordinates, no "location context available".

**4) Now / Around you / Changed / Coming up in Today?** No — not as headings. Today gets **one paragraph** built from the same four inputs, plus the sections it already has. Awareness owns the four named shelves because it is place-scoped. Today's framing stays "what matters right now" and "here's what's moving". Same inputs, same voice, different shape: Today = one paragraph + ranked lines; Awareness = one paragraph + four short shelves for this place.

**5) Split.**
- Awareness only: the place strip, tiers and pin quality, recenter/fix location/map picker, saved-places list, the eight place topics and Scan, nearby places, trip start/end and mileage history.
- Today only: cross-project ranking, commitments, actions, inbox, security, what changed, hand-off, body panel, the Ask bar.
- Shared: the read composer, Why this?, freshness/origin lines, source health, the depth law.

**6) Shared so they feel like one system:** `_shared/situation.ts` (one composer, two callers), `whySurfaced.ts` + `why-surfaced.tsx`, `plainLabels`/`plainEnglish`/`vantaVoice`, `responseDepth.ts` (same compression), `motion.ts` tokens (`MOTION_ROW`/`MOTION_STAMP`/`LEAD_BAR`), `FreshnessLine`/`CardMeta`, and `deriveWeather` ambience. Nothing new invented for Awareness that Today doesn't also use.

**8) Duplication and hierarchy problems found:**
- "What changed" exists four times: `LiveBulletin`, `TodayDigestLine`, the What changed section, and `ActivityTrace`.
- "Coming up" exists twice: `AgendaStrip` and What's next.
- Navigation exists three times: `JumpStrip`, `QuickModes`, the read's own "start here".
- `FirstLapCard` and `GotSomethingChooser` both sit above the read — onboarding outranking the answer.
- `NoticedRow` (proactive) renders *below* the read that is supposed to be the single ranked list — two voices ranking the same day.

## Smallest additions to the approved plan

**A2. Today opens with the read.** Move `SituationRead` directly under the headline; `GotSomethingChooser`, `FirstLapCard`, `JumpStrip`, `CrossDeviceResume` move below it. The headline and the read merge into one paragraph.

**A3. Place inside the read.** Add an optional place to the shared situation composer; when the three conditions hold, the paragraph opens with where you are and the Why this? for any line place touched says so in words. No new UI.

**A4. Fold the duplicates.** `TodayDigestLine` + `LiveBulletin` + What changed become one "What changed" block; `AgendaStrip` folds into What's next; `QuickModes` folds into `JumpStrip`; `NoticedRow` becomes a line inside the read rather than a card beside it. Net: roughly twenty-two blocks down to about ten.

**A5. One quiet state.** When there is nothing, Today says one sentence — "You're clear." — and shows only the read and source health.

Acceptance: on a 384px screen, the paragraph and the ranked lines are visible without scrolling; every line still has origin, freshness and Why this?; nothing about location appears when location is off; the quiet day is one sentence.

Order: A2 and A4 before A (Awareness rebuild) — they cost the least and make the Awareness read feel like the same system. A3 lands with E (place-aware softening).
