# Metro Echo — Comprehensive Audit + World-Aware Boot & Ambient Identity Plan

Read-only audit performed against the actual codebase (three parallel investigators + direct reads). Every LIVE claim below names its proof file; every unverifiable item is flagged. Nothing was edited, deployed, or built.

---

## A. Executive summary & current architecture

**The headline:** the boot sequence is net-new — no splash, welcome, or boot screen exists anywhere today. First paint goes straight from an empty `#root` to the room shell. But every primitive the vision needs is already live and proven in production: the desk-transfer cover (full-screen, event-driven, Solari drum, turnstile sound, `role="status"`), the split-flap components (reused in 6+ files), the sound engine, the daylight/skin attribute system, and a place-truth layer that is genuinely global.

**The honest bottleneck:** truth is global; decoration is not. Place truth, timezone, and Open-Meteo weather work for any coordinate on earth with zero hardcoding. The *painted* layer — city walls (3), country facts (18), local-help emergency numbers (6), customs notes (13) — is hand-kept per place by design ("a country not written up returns nothing"). Holiday/season/cultural-date logic does not exist at all. The plan therefore splits: **derive ambience globally from coordinates/weather/clock (already global), keep curated facts curated, and never let a model fill gaps.**

### Source → truth → presentation (as built today)

```text
device GPS tap / manual pin / place search (Nominatim)
  → awareness_places row (geo jsonb, country/region/label, updated_at)
  → placeTruth.ts (client) + placeSpine.ts (server, mirrored logic, 12h stale window)
  → one sentence + precision bucket (street/neighbourhood/city/area/unknown)
  → consumed by: Today hero, PlaceCueStrip, AskEnvironmentEdge, FieldPolaroid,
    PlaceSkin (sets data-place), TodayLiveMap, ambient-pulse arrival check

Open-Meteo (no key) → FieldPolaroid weather (30min refetch) +
  awareness-snapshot / awareness-drift-sweep (server) → WeatherGauge (CRT glyph, °C/°F)

device clock + profiles.timezone (useUserTimezone) → daylight.ts
  → data-daypart (dawn/day/golden/dusk/night) + --tod on <html> every 5 min

audit_log (55 edge functions write it) → changeBuckets.ts (4 shelves, noise-folded)
  → TodayBriefing / ReceiptsLedger / today-take (Echo's take, 4/hr 12/day cap)
```

### Four rooms + Telegram compatibility

- **Today** (`TodaySurface.tsx`, ~L479–960): hero → headline ("All clear" / "N things moved") → `TodayBriefing` (debrief + Echo's take + SEEN stamp) → time/place cues → `TodayLiveMap` → travel lanes → "Needs you" / "Coming up". Movement = `reduceSituation()` count; background noise folded behind a drawer. LIVE.
- **Work** (`src/components/work/*`): briefing + desks. NOTE: the audit could not confirm desks literally named "Money" and "Local help" exist as routed components — flag for a route-list pass before the plan touches Work.
- **Ask** (`AskRoom.tsx` + 13 supporting components): environment edge bar (`AskEnvironmentEdge` — the *actual* "top-left current read", wired only in Ask, not globally).
- **Receipts** (`AuditSurface.tsx`): day-grouped ledger, ×N folding, status chips (regex-inferred from event names — misclassification risk noted), background-checks toggle.
- **Telegram** (`telegram-webhook`, 426+ lines): same intent pipeline, same voice modules. **Zero place/weather/world grounding in Telegram replies today** — world identity reaching Telegram is new work, not a wire-up.

---

## B. Reality matrix

| Area | Status | Proof / caveat |
|---|---|---|
| App boot/splash/welcome screen | **NOT BUILT** | `src/main.tsx` → `App.tsx`; no component exists. PWA splash is only OS-native `background_color` from manifest. |
| DeskTransit overlay (boot template) | **LIVE** | `src/components/shell/DeskTransit.tsx`; event-driven, Solari drum, turnstile sound, `aria-live`, feelMs-scaled hold. |
| Dawn shutter (first Today of the day) | **LIVE** | `src/lib/skins.ts` `setRoom()` — once/day via `vanta.shutter.day`, `data-shutter="lift"`, 1200ms. Scoped to room entry, not app boot. No test. |
| Solari split-flap | **LIVE** | `SolariBoard.tsx` (55ms step), `SignalBeacon.tsx` `SolariWord` (74ms); reduced-motion gated in both. |
| Street sound engine | **LIVE** | `src/lib/streetSound.ts`; 8 kinds, real mp3s in `public/sounds/` + synth fallback, first-gesture unlock. **Discrepancy: doctrine comment says "off by default / opt-in"; code is on-by-default** (`vanta.sound.v1 !== "off"`). |
| Skin system | **LIVE** | 5 skins (`data-skin`), ambient kill-switch (`data-ambient`), per-device. Tested (`skins.test.ts`). |
| Daylight/daypart | **LIVE** | `src/lib/daylight.ts`; fixed clock-hour buckets, **not solar/latitude-aware** — winter Reykjavik = summer Bangkok dayparts. |
| Operational "weather" (calm/drift/pressure) | **LIVE** | `src/lib/weather.ts` → `data-weather`. **Naming collision: this is task pressure, not meteorology.** A sky layer needs its own attribute. |
| Real weather (Open-Meteo) | **LIVE** | Global, no key. `WeatherGauge.tsx` CRT glyph, `vanta.tempunit` toggle (localStorage only, not profile-synced). |
| Place truth | **LIVE** | Global by design; honest empty states for unknown places. Client/server logic mirrored in two hand-synced files — desync risk enforced only by convention + tests. |
| Painted place walls | **PARTIAL** | `placeSkin.ts`/`placeWalls.ts`: 3 city clusters, 3 countries, per-city JPG assets. Not extensible without code+asset per place. |
| Country facts | **PARTIAL** | 18 countries hand-kept (`countryFacts.ts`); localHelp 6; customs 13. Deliberate no-guess doctrine. |
| Holidays/seasons/occasions | **NOT BUILT** | Confirmed: no date computation anywhere; only keyword matching in scraped text. |
| Live GPS | **LIVE** | `useLiveGps.ts` foreground-only, display-only, stops on tab-hide. **Confirmed: no background tracking, no geofencing anywhere.** |
| Field board + Wikipedia photos | **LIVE / AT RISK** | `FieldPolaroid.tsx` + `place-ground-read` (6 AI reads/day cap). **Licensing gap: hotlinked Commons images with only a blanket "Wikipedia" link — no per-photo author/license attribution.** |
| Maps | **LIVE** | Leaflet everywhere; Mapbox dark tiles when token present, Carto fallback, correct attribution both paths. Marker icons hotlinked from unpkg CDN. |
| Today debrief / Echo's take | **LIVE** | Grounded inputs only; 4/hr 12/day DB-backed cap; 429→200-with-flag fix confirmed in both function and client. SEEN stamp is **localStorage-only — not cross-device**. |
| Receipts | **LIVE** | `audit_log` source; 55 writing functions; deterministic grouping/folding. |
| Reduced motion | **PARTIAL** | 19 hand-written CSS media blocks + 3 duplicated JS `reducedMotion()` helpers. **No global kill-switch — every new animation must remember its own carve-out.** |
| Offline | **PARTIAL** | SW is push-only by design ("no caching, no offline strategy"). `useNetworkReach` exists; no global offline banner; staleness labels are per-component. Google Fonts (Rubik/Space Mono) load from CDN — a boot font dependency on network. |
| Push | **LIVE** | VAPID fixed, FCM 201 confirmed earlier. Caveat for boot: verify `pushClient.ts` subscribe isn't in a blocking mount effect. |
| Bundle/perf | **PARTIAL** | ~17 lazy routes; core rooms eager. No `manualChunks` / size guardrails in `vite.config.ts`. `TodayLiveMap` may pull Leaflet into Today's chunk — unverified. |
| Tests | **LIVE, broad** | ~230 test files; strong on pure logic (place/weather/daylight/motion-prefs). Zero coverage on DOM/animation/audio behavior — a boot sequence inherits no motion regression net. |
| Stray asset | **FLAG** | `public/vanta-verdict.pdf` — unexplained; confirm intentional. |

---

## C. End-state storyboards (fact vs. ambient mock)

Boot anatomy (all scenarios): relay ignition click → Solari roll call of **verified facts only** (place with freshness, local clock, weather with age, operational state) → optional station/welcome stamp → shutter lifts straight into Today. 1.2–1.8s total, any tap skips, reopen <10s bypasses to a 300ms micro-nod, cold boot/first-of-day gets the full pass, reduced motion gets a static frame, sound follows `vanta.sound.v1` and device silent, offline shows an honest "no signal" frame. **If operational weather is `pressure`, an urgent travel connection is live, or SOS is active: boot is skipped entirely — Today paints immediately.**

1. **Samui, sunny dawn (first open of day):** FACTS on drum: `KO SAMUI` · `06:4x ICT` · `29° CLEAR` · `ALL CLEAR`. Ambient: dawn-wall light at low `--tod`, warm gold puddle, single shutter lift, gull-quiet (no extra sound beyond turnstile + clacks).
2. **Samui, storm night:** FACTS: `KO SAMUI` · `22:1x ICT` · `26° STORM` · `1 NEEDS YOU`. Ambient: deep-blue night wash, rain-glyph in the gauge, amber signal lens. Boot shortened; the attention item is named on the drum, never hidden behind theatre.
3. **Bangkok, in transit:** FACTS: `BANGKOK` · `17:0x ICT` · `33° HAZE` · next calendar item if any. Ambient: dusk sodium wash, painted Bangkok wall (already shipped) behind content.
4. **Washington, snowy winter:** FACTS: `WASHINGTON DC` · `08:1x EST` · `-2° SNOW` · DMV region facts if on record. Ambient: cold desaturated tint, snow glyph, short day = dawn/day boundary later (fixed-hour daypart caveat stands until solar math lands).
5. **Tokyo, spring:** FACTS: `TOKYO` · `07:5x JST` · `14° CLEAR`. Ambient: Tokyo painted wall, dawn gold. (Cherry-blossom season note only if the occasions table lands and it's actually within the kept window.)
6. **Unknown place / offline:** drum honestly reads `NEW GROUND` or `LAST KNOWN · 3H AGO`; no wall repaint, no invented weather; offline frame says signal is down and shows device-clock time only. **No fake ALL CLEAR** — operational state reads `UNKNOWN` when unreachable.
7. **Songkran (13–15 Apr, Thailand):** only with the occasions table built and opted-in: a small station-stamp motif on the boot frame + one plain line ("Songkran begins today"). Never a water-splash animation over operational content; suppressed entirely under pressure.
8. **Saved journey milestone:** user-tapped "stamp this" creates a dated station stamp (place + date + receipt link). On later boots *at that place*, the stamp can echo once in the roll call. No automatic route history.

---

## D. Modular architecture

**Channels on `<html>` (each independent, each owned by one module):**
- `data-weather` — operational pressure (existing, untouched).
- **`data-sky` (new)** — meteorological sky: `clear|cloud|rain|storm|snow|fog|wind` × existing `data-daypart`. Sourced only from already-fetched Open-Meteo data (FieldPolaroid's 30-min refresh / snapshot cache). **No external call exists solely for animation.**
- `data-place` — kept painted walls (existing 3) **plus `data-region-tint` (new)**: procedural regional palettes derived from climate band (tropical/temperate/arid/cold from latitude+country), not per-city assets. This is how the system scales globally without 200 hand-painted walls. The 3 painted walls remain as special stations.
- Provenance rule everywhere: every ambient value carries its freshness; stale fix = no repaint (existing placeSkin doctrine extended).

**World stations ladder:** explicit setting → permitted device location → last known (labeled) → honest empty. Neighborhood level only with sufficient consent + precision (existing `nameAllowedAt` precision gates).

**Occasions (new, curated, opt-in):** a small hand-kept table following the countryFacts doctrine — date windows + one plain line + sensitivity flags (e.g. mourning periods, religious observance = no festive motif). Seed: TH (Songkran, Loy Krathong), US (federal set), JP (shogatsu, hanami window), TT (Carnival). Extensible per country; unknown country = silence, never guesses. Hemisphere-aware seasons derived from latitude sign — no northern-hemisphere default.

**Curiosity cabinet (no fifth room):** lives on the field board + one collapsible strip on Today. Candidates from existing parts: WeatherGauge (live), moon phase (pure date math), local + home railway clock (existing timezone plumbing), station/date stamp, connectivity meter (`useNetworkReach`), travel counter (derived from existing trips/journeys data). Rules: no fake telemetry, max one row, everything collapsible, suppressed under pressure.

**Welcome stamps:** opt-in, deliberate tap only. Minimal row (place label, date, optional receipt link). No GPS route collection, ever.

**Accessibility/perf/security:** one shared `reducedMotion()` helper replaces the 3 duplicates; a single global CSS reduced-motion kill-switch added so new animations can't leak; boot respects `data-ambient="off"`; static boot frame under reduced motion; no flashing (all motion ≤3Hz, no large-area strobes); self-host Rubik + Space Mono to remove the boot-time font network dependency; boot never blocks push registration or hero paint; all new client state localStorage-scoped per device; no location writes from any cosmetic path.

---

## E. Staged roadmap (narrow, reversible)

**Stage 1 — Boot foundation (the approval target below).**
`BootSequence` component composed from the DeskTransit pattern: relay ignition → Solari roll call reading placeTruth + clock + cached weather + operational state → shutter into Today. Timing rules (1.2–1.8s, skip, <10s bypass, first-of-day richer), pressure/urgent bypass, reduced-motion static frame, offline honest frame, `data-sky` attribute scaffold (clear/cloud/rain/storm/snow/fog × daypart) driven only by already-fetched weather. Shared `reducedMotion()` helper + global CSS kill-switch. Tests: timing/bypass logic unit tests; Playwright 384px + desktop, reduced motion, offline, pressure-bypass; real-phone PWA cold start by Max.
*No new tables, no new API calls, no Telegram changes.*

**Stage 2 — Global station ambience + licensing fix.**
`data-region-tint` procedural palettes (climate band × daypart) so every country gets a coherent wall without new assets; region-tint tests (hemisphere, unknown-country fallback). Wikipedia per-photo attribution via Commons `extmetadata` (artist + license) rendered under each photo — fixes the live compliance gap. Self-host fonts.

**Stage 3 — Seasons & occasions.**
Latitude-hemisphere season derivation; curated occasions table (TH/US/JP/TT seed) with sensitivity flags and opt-in toggle; station-stamp motif on boot frame during a kept window; suppressed under pressure.

**Stage 4 — Curiosity cabinet.**
Moon phase (date math), local/home clock, connectivity meter, travel counter — field board first, collapsed Today strip second. One row max.

**Stage 5 — Welcome stamps.**
Opt-in stamp action + tiny table (RLS, grants, service_role) + stamp card + boot echo when standing at a stamped place.

**Stage 6 — Telegram world line (small).**
One grounded line of place/weather context in Telegram briefs, reusing today-take's grounded-input pattern. Same Echo, same caps.

**Pinned, separately approved later — Field Beacon / SOS:** hold-to-arm flare, draft-vs-send separation, recipients, confirmed dispatch + fallback, audited minimum info, legal/privacy review, low-power breadcrumbs as independently opted-in with retention/deletion policy. Movement >25km is never proof of landing. No background tracking triggered by cosmetics. Defer multiplayer/sharing entirely.

Each stage ships behind existing per-device toggles (`data-ambient`, sound, Feel presets) and is independently revertible. Regression gates per stage: typecheck, full vitest, Playwright mobile+desktop+reduced-motion, PWA cold-start timing on a real phone, and the critical-bypass test (pressure state → zero boot delay).

---

## F. Costs, dependencies, licensing, risks

- **AI cost:** boot itself uses **zero AI**. Ground read (6/day) and Echo's take (4/hr, 12/day) caps unchanged. Occasions/seasons are deterministic tables — no AI.
- **Dependencies:** Open-Meteo (free, no key) — already global; Nominatim (free); Wikipedia/Commons (free but attribution-bound); Mapbox (token linked; Carto fallback); Leaflet marker icons from unpkg CDN (minor runtime dependency — consider self-hosting in stage 2).
- **Licensing actions:** (1) Wikipedia photos need per-photo author/license credit — current blanket link is non-compliant for CC-BY-SA; fix in stage 2. (2) The 8 wall JPGs + sounds have no license/origin metadata in-repo; likely AI-generated but unverifiable — recommend a CREDITS note once confirmed. (3) Google Fonts: OFL, fine to self-host. (4) Do not use inspiration/reference images without confirmed licenses.
- **Risks:** boot becoming a blocking splash (mitigated: skip + bypass + pressure override, hero-first paint); animation leaks to reduced-motion users (mitigated: global kill-switch); placeTruth/placeSpine hand-mirrored desync (consider parity test in stage 1); Today clutter (cabinet capped at one collapsible row); TodayLiveMap possibly dragging Leaflet into Today's chunk (verify before boot work, lazy it if true); SEEN/ack state localStorage-only (stamps designed per-device accordingly); `vanta-verdict.pdf` stray asset (confirm or remove).

---

## G. Decisions for Max

1. **Boot frequency** — full boot on cold start + first-open-of-day; 300ms micro-nod on quick reopens; any tap skips. *Default: yes.*
2. **Separate sky channel** (`data-sky`) so storms never read as task pressure. *Default: yes.*
3. **Global ambience via procedural regional palettes** instead of painting a wall per city; keep the 3 painted walls as special stations. *Default: yes — the only way "globally extensible" works without per-city assets.*
4. **Occasions:** curated, opt-in, sensitivity-flagged, TH/US/JP/TT seed; unknown country = silence. *Default: yes.*
5. **Curiosity cabinet placement:** field board + one collapsible Today strip. No fifth room. *Default: yes.*
6. **Welcome stamps:** tiny new table with RLS vs. derive-only from existing data. *Default: tiny table — deliberate user action deserves a real receipt.*
7. **Wikipedia attribution fix** included in stage 2. *Default: yes — it's a live compliance gap.*

**Next narrow build approval text (Stage 1 only):**
"Build the boot foundation: a BootSequence composed from the DeskTransit pattern — relay ignition, Solari roll call of verified place/clock/weather/operational state, shutter into Today; 1.2–1.8s max, tap-to-skip, <10s reopen bypass, richer on cold boot and first-open-of-day, static under reduced motion, silent when sound is off, honest offline frame, and instant bypass whenever operational pressure or an urgent travel/SOS state is active. Add the data-sky attribute scaffold driven only by already-fetched weather, the shared reduced-motion helper, and the global CSS kill-switch. No AI calls, no new tables, no per-city assets, no Telegram changes. Gate: typecheck, full tests, Playwright mobile/desktop/reduced-motion/offline/pressure-bypass, then Max's real-phone PWA cold-start check."

Stages 2–6 and the Field Beacon return for their own approvals after Stage 1 lands.
