# Awareness UI/UX — Audit + Staged Polish Plan

## Part 1 — Pipeline Audit (rendered state)

### What's actually shipped and wired

| Layer | Status | Evidence in rendered UI |
|---|---|---|
| L1 reverse-geocode | ✅ live | `awareness-geocode` invoked on capture + recenter in `AwarenessSurface.tsx:83, 123` |
| L2 tier classifier | ✅ live | `classifyTier(place)` rendered as tier chip in place strip (`AwarenessSurface.tsx:162-180`) |
| L3 evidence bundle to Gemini | ✅ live | `awareness-brief` reads `awareness_snapshots`, passes weather/SerpApi/Reddit/source_states/tier into prompt with section-aware slicing + "use only this evidence" + empty-slice fallback |
| L4 tier-aware source routing | ✅ live | `awareness-snapshot` selects google_maps engine for exact/saved, broad SerpApi for city/country |
| L5 tier-aware Scan button | ✅ live | `tierScanCopy()` renders explicit Scan button with helper + source-impact line; never auto-fires |
| L6 plain-talk normalizer | ✅ live | `normalizeAwarenessSignal` used in `SectionDrawer` and `AwarenessSurface` active-layer card |

### Real disconnects found in the rendered UI

These are the actual gaps. None require pipeline changes — only UI wiring.

1. **Command Center renders the full `AwarenessHUD`, not the compact `MiniRadarStrip`.**  
   `CommandCenterSurface.tsx:150` mounts `<AwarenessHUD />` — that's the 912-line radar room, not a compact mini-card. `MiniRadarStrip` exists, is already compact + drawer-driven, but is unused. This violates the spec's "Command Center = radar feed, Awareness = radar room."

2. **Tier chip and Source pill exist in `AwarenessSurface` but not in `MiniRadarStrip` summary line.**  
   `MiniRadarStrip` shows place + weather + freshness but no tier badge and no scan button adapted to tier. Once we swap it into Command Center, those need to be added.

3. **Mini-radar Scan button is generic.**  
   `MiniRadarStrip:137-147` uses "Refresh" / "Scan area" hardcoded — does not use `tierScanCopy()`. Should mirror `AwarenessSurface` so both surfaces tell the same story.

4. **Source chips in `MiniRadarStrip` and `AwarenessHUD` derive tier from raw `sources_used` strings** (`tierFor()` keyword match). They count present sources but don't render the honest "Search ON but no scan has run" / "cached" / "failed" states. The `SourceStatusPill` does this honestly — it's already rendered in `MiniRadarStrip:123`, but only on desktop (`!isMobile`). Mobile loses the most important truth signal.

5. **AwarenessSurface bottom padding is `pb-24` but no `safe-bottom`.**  
   Bottom nav (`SurfaceTabs`) uses `safe-bottom` and is 64px tall. On iOS PWA / notch devices the last layer chips / places list can sit under the nav. The scrollable area needs `safe-bottom` plus enough extra for the floating Companion bubble (`fixed bottom-20 right-4`).

6. **Companion floating bubble at `bottom-20 right-4` overlaps the Scan/Recenter area on small screens.**  
   On 360–390px wide screens with the place strip + Scan button stack, the 48px bubble at y=80 from bottom lands on top of the layer-chip row when scrolled to the bottom. No collapse-on-drawer-open behavior exists.

7. **Layer chips use `flex-wrap`** (`LayerChips.tsx:46`).  
   9 chips (8 sections + terrain) wrap to 3 rows on 360px. Spec asked for horizontal scroll OR compact icons. Currently a "messy wall" exactly as the spec said not to do. Tap targets are ~28px tall — under the 44px iOS minimum.

8. **Active-layer drawer trigger inside `AwarenessSurface:286-340`** renders the SignalCard inline below the chips but never opens the `SectionDrawer`. So tapping a chip filters the radar (good) but to see full detail the user must find the "View full detail" mini-link in the inline card. Spec wants a clean bottom sheet path for thumbs.

9. **Terrain visible response in radar is unclear.**  
   `AwarenessHUD` accepts `activeLayer` and has a `terrainMode` memo (fixed in last pass), but the spec asks for visible overlay variation per terrain (water rings, urban grid, etc). Not built. Currently only pings dim. Need a minimal terrain-mode backdrop swap (4 variants max — water / urban / wild / unknown — keyed off `geo.city` keywords or a simple country/region heuristic). Subtle, not gamer-RGB.

10. **No "Search ON, no scan yet" specific copy in mini-card.**  
    `MiniRadarStrip:182-186` falls back to "No scan yet. Tap Scan area when you want one." — fine, but doesn't differentiate Search-on vs Search-off. `SourceStatusPill` does this honestly via `computeSourceStatus()` — already exists, just needs to be visible on mobile too.

11. **Legend / "What am I seeing?" helper does not exist** on the radar. Pings have tooltips but no first-use hint, no ping-type legend.

12. **Mobile copy is identical to desktop.**  
    `normalizeAwarenessSignal` returns one length of summary. No `compact` vs `verbose` mode. Spec wants shorter mobile lines.

## Part 2 — Out of scope (explicitly NOT doing)

- No new edge functions.
- No new tables.
- No new tabs.
- No redesign of Awareness or Command Center layout grids.
- No changes to `awareness-brief`, `awareness-snapshot`, `awareness-geocode` (pipeline is correct).
- No new Companion features.
- No animations beyond subtle CSS.

## Part 3 — Staged polish plan

Each stage = one user message, shippable, validated separately. Mobile-first.

### Stage A — Honest source state everywhere (no new data)

- Show `SourceStatusPill` on mobile in `MiniRadarStrip` (drop the `!isMobile` gate).
- Show `SourceStatusPill` in the floating Companion situation row when on Awareness/CommandCenter routes.
- Add tier chip to `MiniRadarStrip` summary line.
- Wire `tierScanCopy()` into `MiniRadarStrip` button so label adapts (Scan This Spot / Scan Koh Samui Context / Confirm Place First).

### Stage B — Command Center uses the compact mini, not the full radar

- Swap `<AwarenessHUD />` → `<MiniRadarStrip />` in `CommandCenterSurface.tsx:150`.
- Add "Open Awareness" CTA in the mini-card that calls `onNavigate("awareness")`.
- Mini gets: tier, place, source pill, scan button (tier-aware), top 1–3 signals from `latestBySection`, freshness, no full radar.

### Stage C — Mobile-safe layout chrome

- Add `safe-bottom` to `AwarenessSurface` scroll container and bump bottom padding to clear the 64px nav + 48px Companion bubble.
- Companion bubble: auto-hide when any Awareness drawer/sheet is open (subscribe to `panelMode` + a new drawer-open flag), and move from `bottom-20` to `bottom-24` on Awareness route only.
- Sticky place strip on mobile (`md:static sticky top-0`) so Where/Tier/Confidence/Source stay visible while scrolling layers.

### Stage D — Layer chips that don't wrap into a wall

- Convert `LayerChips` row to horizontal scroll on mobile (`overflow-x-auto snap-x`), bump min height to 36px (~44px hit area with padding).
- Keep wrap behavior on `md:` desktop.
- Add icons next to labels (transport→Car, payments→CreditCard, etc) so they're recognizable at a glance.

### Stage E — Visible terrain response

- Add `terrainMode` heuristic in `awarenessPlainTalk.ts`: `"water" | "urban" | "wild" | "unknown"` derived from place country + offshore guess + city keywords.
- In `AwarenessHUD`, swap radar backdrop ring/gradient by mode (4 subtle variants, all using existing semantic tokens — no new colors). Dim pings further when terrain active (already partially done).
- Update the terrain helper text in `AwarenessSurface:278-284` to name the terrain mode plainly ("Showing water/coastal backdrop — most exact-pin signals dimmed.").

### Stage F — Detail drawer is the default deep view + "What am I seeing?"

- Make layer-chip tap open `SectionDrawer` as primary path on mobile (inline card stays as a quick-peek summary).
- Inside `SectionDrawer` first viewport: Summary / Why / Next / Confidence / Source chips / Routes. Long detail collapsed.
- Add a small `?` helper button next to the radar that opens a tiny popover legend explaining ping = data, dot = decoration, freshness ring = how old, layer filter = which slice.

### Stage G — Mobile-shorter copy

- Add `compact?: boolean` to `normalizeAwarenessSignal` and `broaderContextCopy`. When compact, return ≤14-word summaries.
- Pass `compact` from `MiniRadarStrip` and from the inline layer card on mobile (`useIsMobile`).
- Desktop unchanged.

### Stage H — Final validation pass

- Browser-test mobile (390x844 iPhone, 360x800 Android) and desktop:
  - Command Center renders mini, not full radar.
  - Awareness shows tier + source pill + tier-aware Scan button.
  - Terrain mode swaps backdrop.
  - Layer chips scroll horizontally, ~44px tap height.
  - Companion bubble doesn't overlap Scan / chips / drawer.
  - Detail drawer opens from chip tap, short copy default.
- Capture screenshots, attach to final summary.

## Part 4 — Acceptance gate

Stage H is the only "complete" signal. Earlier stages may ship but the audit closes only when the mobile screenshots show:
- Honest source pill on mobile.
- Tier-aware Scan label on both surfaces.
- Compact Command Center (no full radar).
- Horizontal layer chips with comfortable tap targets.
- Visible terrain backdrop variant.
- Companion not blocking primary controls.
- Short mobile copy.

## Technical notes

- All changes live in: `AwarenessSurface.tsx`, `MiniRadarStrip.tsx`, `AwarenessHUD.tsx`, `LayerChips.tsx`, `CommandCenterSurface.tsx`, `CompanionWidget.tsx`, `awarenessPlainTalk.ts`, `SectionDrawer.tsx`, and `index.css` (one or two safe-area utility additions).
- No DB migrations. No edge function changes. No new dependencies.
- Reuses existing tokens in `index.css` / `tailwind.config.ts` — no new colors.
