# Awareness — Map Picker + Overpass Sanity + Auto-Refresh + Last-Good Suggestion

Targeted upgrade to the bad-location recovery flow we already shipped. Four self-contained pieces, all wired into the existing `BadLocationRecoveryPanel` + `AwarenessSurface` + `awareness-geocode` plumbing. No rewrite of awareness, no new architecture, no native code.

---

## 1. Pick-from-map flow

A real map you can tap to drop a pin, with reverse-geocode preview, and an **Apply as active place** button.

- New component `src/components/awareness/MapPickerDialog.tsx` (radix `Dialog` + `leaflet`).
- Library: `leaflet` + `react-leaflet` (small, no API key, OSM tiles). Add via `bun add`.
- Behavior:
  - Centers on the user's last known good place if any, else current pin, else a sane default (Koh Samui if the bad pin is offshore in SE Asia, otherwise world view).
  - Search box at top reuses existing `searchPlaces()` from `locationSanity.ts` — selecting a hit recenters the map and drops the pin.
  - Drag/tap to move pin. Live "Resolving…" label calls Nominatim reverse once the pin settles (300 ms debounce).
  - Apply button is disabled until reverse-geocode returns a `country`. Confirms with the resolved label.
  - On apply: inserts a new `awareness_places` row (mirrors `useHit` in the recovery panel), calls `setActivePlace()`, triggers the auto-refresh from §3, closes dialog.
- Wired into `BadLocationRecoveryPanel` as a third primary action: **"Pick on map"** alongside High accuracy / Quick recenter.
- Mobile: full-screen dialog at <640 px (existing `Dialog` works, just add `sm:max-w-md` + `h-[100dvh] sm:h-auto`).

## 2. Overpass land/water + nearby-feature sanity

Server-side sanity layer that runs **only when Nominatim returns low confidence** (no country/region). Cached so we never hammer Overpass.

- Extend `supabase/functions/awareness-geocode/index.ts`:
  - After Nominatim returns, if `!country && !region`, query Overpass:
    ```
    [out:json][timeout:8];
    is_in({lat},{lon})->.a;
    (
      .a[place];
      node(around:3000,{lat},{lon})[place~"island|town|village|city|hamlet|suburb"];
      way(around:5000,{lat},{lon})[natural=coastline];
    );
    out tags 5;
    ```
  - Classify:
    - Any `place=*` hit nearby → write a synthetic `region`/`city` (e.g., "Koh Samui") and mark `geo.sanity = "land_nearby"` with the closest feature name + distance.
    - Only `natural=coastline` hits with no `place` → mark `geo.sanity = "offshore_confirmed"`, do NOT invent a country.
    - Nothing → `geo.sanity = "unresolved"`.
  - Cache the Overpass result keyed by rounded lat/lon (3 decimals → ~110 m grid) in a new tiny table `awareness_overpass_cache (cell_key text pk, payload jsonb, fetched_at timestamptz)` with a 7-day TTL check in the function. RLS: service-role read/write only, no client access.
- Client: `classifyPlaceBadness()` in `locationSanity.ts` reads `geo.sanity` first — if `offshore_confirmed`, headline becomes the existing "This pin looks offshore." with high certainty; if `land_nearby` with a city, badness drops to `bad: false`.
- Guardrails: Overpass call is wrapped in `Promise.race` against an 8 s timeout, errors are swallowed (function still returns whatever Nominatim gave us), and we only call it on the no-country path — never on healthy pins.

## 3. Auto-refresh after successful recenter/geocode

Today `BadLocationRecoveryPanel` calls `reverseGeocode()` then relies on realtime to re-paint, and the snapshot/brief is not re-run. The "too broad" view sticks around.

- After every successful recenter (both `quickRecenter` and `highAccuracyRecenter`) and after the `useHit` / map-picker apply path:
  1. Await `reverseGeocode()`.
  2. Await `refresh()` (already happens).
  3. If the fresh row has `country`, fire `refreshSnapshot(true)` and then `generate(missing_section)` for any still-missing core section, in the background (no spinner blocking).
  4. Toast `vantaSay.locationFixedRescan()` once.
- Also extend the existing `prevCountryRef` effect in `AwarenessSurface.tsx` so the same auto-snapshot fires when realtime delivers the `null → country` transition (covers cases where geocode finishes after the user navigated away from the panel).
- Debounce: a `useRef` flag prevents double-fire when both the panel callback and the realtime effect see the transition.

## 4. One-tap "use last confirmed place" suggestion

Today the bad-location panel shows the full "Use a saved place" list. Pre-empt it with one big chip for the most recent place that actually resolved.

- In `BadLocationRecoveryPanel`, when `badness.bad`, compute `lastGood = alternatives.find(p => p.country)` (alternatives is already filtered for `!!country` in `AwarenessSurface`).
- Render above the recenter buttons:
  ```
  ┌──────────────────────────────────────────────┐
  │  ↩  Use Lamai, Koh Samui again               │
  │     Last confirmed place · 2d ago            │
  └──────────────────────────────────────────────┘
  ```
  One-tap button → `setActivePlace(lastGood.id)` → toast `vantaSay.switchedPlace(label)` → panel closes (no longer bad).
- Falls back silently if no good alternative exists.

---

## Technical notes

**Files created**
- `src/components/awareness/MapPickerDialog.tsx`
- `supabase/migrations/<ts>_overpass_cache.sql` (new `awareness_overpass_cache` table, service-role only RLS)

**Files edited**
- `src/components/awareness/BadLocationRecoveryPanel.tsx` — add map picker button, last-good chip, auto-refresh-after-success
- `src/lib/locationSanity.ts` — read `geo.sanity` in `classifyPlaceBadness`
- `src/components/surfaces/AwarenessSurface.tsx` — extend country-transition effect to also call `refreshSnapshot(true)` once, with dedupe ref
- `supabase/functions/awareness-geocode/index.ts` — Overpass fallback path + cache lookup
- `src/lib/vantaVoice.ts` — add `useLastGood(label)` and `mapPickerApplied(label)` phrases
- `package.json` — add `leaflet`, `react-leaflet`, `@types/leaflet`

**Out of scope (explicit)**
- No native maps, no Mapbox, no tile-server account.
- No new realtime architecture — reuses existing `awareness-provider` channel.
- No change to brief/snapshot prompts or tier classification logic.
- No change to PWA/install flow.
