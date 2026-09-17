# Next pass — World Context, Place Truth, Universal Reach

Plan only. Nothing below is built yet.

## 1. Grounded audit — what already exists

**World context (A)** — more exists than the brief assumes.
- `supabase/functions/_shared/measures.ts` — distance/weight/temperature/volume/area conversion, plain-language "sense of it" line, shoe sizing. Mirrored client-side by `src/lib/measures.ts`.
- `supabase/functions/_shared/countryFacts.ts` — kept per-country notes with a `checked_on` date: phone code, plugs, voltage, driving side, date format, clock, tax-included, tipping, paying, fuel units, SIM/eSIM, phrases. Written for a handful of countries only.
- `supabase/functions/_shared/judgment/worldBackbone.ts` — the provenance/freshness/disagreement backbone with 17 topics. Currently has no facts flowing into it.
- `currency.ts`, `customs.ts`, `streetSmart.ts`, `trouble.ts`, `localHelp.ts`, `careFinder.ts`, `airportIntel.ts`, `weather.ts` all exist.
- Gap: three separate fact stores (countryFacts, customs, worldBackbone) and no single consumer. No region/state layer. No open-now normalisation into the backbone.

**Place context (B)**
- `placeSpine.ts`, `placeTruth.ts`, `placeMove.ts`, `locationSource.ts`, `locationSanity.ts`, `placeLabels.ts`, `placeBoard.ts`, `geohash.ts` — precision ladder, source ladder, staleness, "names never travel with coordinates", device-fix recording on an explicit tap.
- Tables: `awareness_places`, `trips`/`trip_points`/`journeys`, `calendar_events` locations, `operational_state_events`.
- Gap: no single **place state** object with role (home / temporary base / current / recent / transit / destination), no country→region→metro→locality hierarchy, no multi-source fusion, no recorded meaningful transitions, no conflict surfacing when itinerary and device disagree.

**Universal reach (C)**
- `_shared/webpush.ts` (VAPID + aes128gcm), `public/sw.js` (push, notificationclick deep-link, share target), `src/lib/pushClient.ts`, `push-config`, `push-test`, `push-diagnose`, `push_subscriptions` table.
- Awareness pipeline: `signal → relevance → urgency → suppress → bundle → deliver` in `_shared/awareness/`, with quiet hours, attention budget and `liveChannels()` consent gates.
- Actual senders today: `awareness-drift-sweep` and `commitment-reminders` each hand-roll their own subscription fetch, send, 404/410 cleanup. `flight-notice` and Telegram have their own path.
- Gap: no single send rail, no notification actions in the SW, no dedupe across push + Telegram for one event, no fallback, no receipt per delivery, no lock-screen privacy mode.

**Situational Ask (D)**
- `AskContextStrip.tsx` shows scope/thread binding only — no where/when/next. `askSuggestions.ts` is already state-derived and returns nothing when nothing is real. `useAskContext`, `todayContext.ts`, `situation.ts`, `SituationRead.tsx`, `PlaceCueStrip.tsx`, `TravelLane.tsx` exist.
- Gap: environment (place, local clock, next thing) is not on the strip, and Ask/Today/Telegram each assemble context separately.

**Motion (E)** — `motion.ts`, `motionPrefs.ts`, `flip.ts`, `spreadMarkers`/`railWidthFor`, `AgendaLiveStrip`, `BodyLiveStrip`, flight live strip. Reduced-motion respected. Reusable as-is.

**Documents (H)** — already substantial: `documents.ts`, `documentTemplates.ts`, `documentExport.ts`, `documentDocxExport.ts`, `documentDraftExport.ts`, `documentDiff.ts`, `briefs.ts`/`briefTemplates.ts`/`briefFootnotes.ts`/`briefSensitivity.ts`, `projectSummaryPdf.tsx`, `brief_exports` table, `documents-draft` / `documents-extract` functions, `@react-pdf/renderer` and `docx` already installed.

## 2. Gap list

Genuinely missing: place-state roles + region hierarchy + transition ledger + conflict surfacing; one delivery rail with receipts and dedupe; notification actions; environment line in Ask; world-fact ingestion into the backbone.

Needs wiring/polish only: measures/countryFacts/customs → backbone; push senders → one rail; Ask suggestions → situation-aware set; document engine → charts, spreadsheets, weekly digest, non-legal artifact kinds.

## 3. Recommended build boundary — be ruthless

**Next implementation turn = A + B + C only, proved by travel.**

Out of that turn: the Work document engine (H) becomes its own approved pass afterwards; street-smart lane (G) is only checked for fit; outside-user readiness (I) becomes an observation checklist doc, not UI.

## 4. Phases inside the turn

1. **World context spine.** One `worldContext` module that reads measures + countryFacts + customs + currency + local help and emits `WorldFact[]` into the existing `worldBackbone` contract, with region-level facts allowed (US state tax/tipping, equivalents elsewhere). Missing topic says missing.
2. **Place state.** `placeState` module: role, hierarchy, fusion from explicit statement / granted fix / device timezone / journey / calendar location / nearby request, plus confidence and freshness. Conflicts returned as conflicts.
3. **Transition ledger.** Record only meaningful transitions (country, region, metro, airport arrival, return home) with provenance. No breadcrumb trail.
4. **Delivery rail.** `_shared/delivery/` — one `deliverSituation()` used by every sweep: judgment → eligibility → surface → send → receipt, with a per-event dedupe key shared across push and Telegram, and fallback only when the preferred surface fails.
5. **Notification actions + deep links.** SW gains View / Later / Got it / Stop watching; each maps to the same underlying situation record. Approvals still open Metro Echo.
6. **Ask + Today environment edge.** One shared read powering the Ask strip (`WHERE · TZ | next thing`), Today's existing travel situation and the Telegram prompt block. Empty when irrelevant.
7. **Travel proof.** Virginia → airport → Tokyo layover → Thailand walked end to end as one updating situation, not new cards.

## 5. Data model changes

- `place_state` — one current row per user/scope: role, country, region, metro, locality, exact place id (nullable), source, confidence, `fixed_at`. Necessary because no table holds a *role-aware* current place.
- `place_transitions` — from/to hierarchy level, evidence sources, confidence, recorded_at. Necessary for "what changed while I was in the air" and for receipts.
- `world_facts` — topic, country, region (nullable), value, source, checked_on. Necessary so facts have provenance in the database instead of being frozen in code.
- `deliveries` — situation ref, dedupe key, surface, status, sent_at, receipt ref. Necessary for one-event-one-judgment dedupe and delivery receipts.
- No changes to flights, calendar, wearables, money. All four tables get grants + scope-aware RLS.

## 6. Providers and blockers

Reuse: Google Maps/place lookup (already keyed), Aviationstack (keyed, 40/day cap), weather source, timezone data via `date-fns-tz`. No new paid provider. Blockers unchanged: real bank credentials (money), WhatsApp Business approval. iOS web push requires an installed PWA — documented, not faked.

## 7. Permission and privacy model

Location only from an explicit tap or an explicit statement; no background watching. Coarse geography used only when it changes the answer and always labelled. Transitions stored, trails not. Lock-screen wording has two modes: full preview, or privacy-safe wording for money/health/personal content, defaulting to privacy-safe. Every new table scope-filtered.

## 8. Delivery and dedupe

One judgment per event produces one dedupe key. First eligible surface wins in the order phone → Telegram → Today → silence, per existing consent gates. Second surface only on failure or on a critical bypass. Telegram "Later"/"Handled" writes to the same situation record, never Telegram-only state. Quiet hours, attention budget and suppression are called, not re-implemented.

## 9. Ask / Today / Telegram behaviour

One context read, three renderings: a one-line strip in Ask, an existing lane in Today, a prompt block in Telegram. Suggestions come from the same state; zero suggestions renders nothing.

## 10. Motion

Timezone shift settles once. Route trace resolves on arrival. Gate change reroutes once. Agreement converges; conflict stays visually split. Receipt stamps. Nothing animates when nothing changed. Reduced motion jumps straight to final state with no lost information. No country skins, no flags.

## 11. Tests and proof

Full suite green with exact count (currently 1,670). Typecheck clean. New coverage: unit/region fact resolution and missing-topic wording; place fusion and role assignment; conflicting itinerary vs device; transition recording and trail absence; delivery dedupe across push + Telegram; fallback; quiet hours; notification action → situation update; deep links; Ask strip visible/invisible cases. QA at 384px and 1440px, reduced motion, and a simulated timezone change.

## 12. What NOT to build

No fifth room. No converter/tools page, map room, world dashboard, finance/health/housing room. No background location. No breadcrumb history. No always-on sensing. No approvals from a notification. No second reasoning engine. No native rewrite. No country theming. No document engine in this turn.

## 13. Risks and rollback

- Place fusion could speak with false confidence — mitigation: existing precision ladder governs wording; conflicts refuse to pick.
- Routing all sweeps through one rail could silence real alerts — mitigation: rail lands behind a per-sweep switch, old path kept for one pass.
- Notification actions could drift from platform state — mitigation: actions only write status, never execute.
- Rollback points: each phase is independently revertable; migrations are additive only.

## 14. Approval checkpoint

Approve this boundary (A + B + C, travel as proof, document engine deferred) and I start at Phase 1. If you would rather lead with the document engine, say so and I will re-stage.
