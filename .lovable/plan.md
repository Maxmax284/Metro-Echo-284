
# Awareness Radar UX Maturity — Audit + Staged Plan

The uploaded prompt explicitly says: **audit first, then a staged plan, then implement**. This is the audit + plan. No code changes yet.

---

## Part 1 — Audit (what's actually there today)

### Radar surface (`AwarenessHUD.tsx`)
- SVG radar with sweep + pings. Pings come from **two real sources**:
  1. `snapshot.sources_used` (e.g. `open-meteo`, `gemini`, `lovable-ai`) → rendered as `src:*` pings.
  2. `latestBySection` briefings (8 sections) → `brief:*` pings.
  3. Plus "ghost" pings for pinned keys with no backing data.
- Ping **position is a hash of the label** — purely decorative. It is not geographic and the user has no way to know that.
- Ping **size encodes strength** (`b.confidence === "high"`), color encodes pinned vs not. There is **no legend, no label-on-hover beyond `<title>`, no tap-to-understand**.
- Tap on a ping opens a drawer with a "Focused" panel; for `src:*` pings the body is a generic "Source feeding the current snapshot" — not a real per-source explanation.
- Source tier chips (Official/Local/Community/Web/AI) act as **filters on source pings only** — brief pings always show. This is the closest existing thing to a layer filter, and it works.
- Owner-only `SerpApi` toggle pill. No plain-language explanation when off beyond "off".
- Refresh button still labeled **"Generate"** when no snapshot exists.
- A `location_warning` SignalCard renders when the snapshot reports one — this is real and well-built.

### Layer chips (`LayerChips.tsx`)
- 8 chips for the 8 sections. Tap → `SectionDrawer`. They **do not act as radar filters** — the radar canvas doesn't react when a layer is picked. Drawer renders the briefing for that one section.

### Section drawer (`SectionDrawer.tsx`)
- Reads-first, refresh secondary. Button label is **"Generate"** when no briefing exists. Empty state copy: "Tap Generate to assemble one."

### Signal card (`SignalCard.tsx`)
- Already does the heavy lifting: title, signal_type, confidence/risk/freshness chips, short_summary, why_it_matters, what_to_do_next, sources, long_detail toggle, routes (Ask Vanta / Save to Memory / Send to Sherlock / etc.), feedback bar. **This is the right primitive.** Most "human plain-talk" requirements just need the upstream content to be plain.

### Awareness surface (`AwarenessSurface.tsx`)
- Place strip with label + confidence chip + freshness word. **No Recenter / Refresh Position / Confirm Place controls.** Only "Use here" (capture a new place) and "Switch place" (toggle list).
- Hero radar (HUD), attention queue, layer chips, places list.

### Command Center mini (`MiniRadarStrip.tsx`)
- Compact card with place, weather, summary, tier chips, refresh. **No Locate Me / Update Position button.** Refresh is labeled "Generate" when no snapshot. Shared state with full Awareness via `useAwareness` ✅.

### Snapshot/brief backends
- `awareness-snapshot` already produces a `location_warning` signal when reverse-geocode looks offshore/broad — this is the foundation for "Confirm Place".
- All paid calls are guarded by `apiGuard` + `system_controls.serpapi_enabled`. No paid call on page render today ✅.

### Findings summary
| # | What | Status |
|---|------|--------|
| 1 | Decorative ping positions presented as if geographic | **Problem** — needs labels + legend, no geographic claim |
| 2 | Layer chips don't filter the radar | **Problem** — currently behave like prompt buttons (open drawer) |
| 3 | "Generate" used as primary verb on radar | **Problem** — replace with Scan / Refresh / Pull Sources |
| 4 | No Locate Me on Command Center | **Missing** |
| 5 | No Recenter / Refresh Position / Confirm Place on Awareness | **Missing** |
| 6 | No Terrain layer / classification | **Missing** |
| 7 | SerpApi/Community off-state lacks plain-language explanation | **Problem** |
| 8 | Per-source ping detail is generic | **Problem** |
| 9 | No legend / tap-to-understand helper | **Missing** |
| 10 | Briefing copy can read robotic (upstream LLM) | **Watch** — fix in prompts, not UI |
| 11 | Shared active-place state between CC and Awareness | **Working** ✅ |
| 12 | Paid-call guards in place | **Working** ✅ |
| 13 | SignalCard renders structured signals well | **Working** ✅ |

---

## Part 2 — What we will NOT touch

- No schema migrations.
- No new edge functions. No changes to `awareness-snapshot`, `awareness-brief`, `awareness-query`, `awareness-decay`.
- No new map/tile/terrain APIs. Terrain is inferred from existing snapshot data (reverse-geocode result, weather, sources) — purely client-side classification for v1.
- No new tab. Terrain is a **layer**, not a route.
- No changes to `apiGuard` or `system_controls`. Locate Me must not trigger SerpApi or deep Gemini.
- No changes to Companion, Sherlock, Memory, Intake, Audit, Telegram surfaces.
- No removal of the SerpApi owner pill.

---

## Part 3 — Staged plan

Each stage is independently shippable. Stop between stages for review.

### Stage A — Plain-talk + verb cleanup (lowest risk, highest legibility win)
Rename user-facing verbs across the radar surfaces:
- `AwarenessHUD`: "Generate" → "Scan area" (no snapshot) / "Refresh signal" (has snapshot). Tooltip + button label.
- `MiniRadarStrip`: same — and the empty-state copy "No snapshot yet. Hit Generate…" → "No scan yet. Tap **Scan area** when you want one."
- `SectionDrawer`: "Generate" → "Scan layer" / "Refresh", empty-state copy parallel.
- SerpApi pill: tooltip becomes plain language — on: "External search is on." off: "External search is off — I'm using saved/cached info only."
- When community/SerpApi is off, tier chip tooltip: "Community signal is off, so I'm not checking Reddit/forums/local chatter."
- Add a small `freshLabel(generated)` helper line to MiniRadarStrip: "Last scan 12 min ago" instead of bare relative time when stale.

Files: `AwarenessHUD.tsx`, `MiniRadarStrip.tsx`, `SectionDrawer.tsx`, `AwarenessSurface.tsx`.

### Stage B — Legend + per-ping clarity
- Add a small **"Radar key"** popover to `AwarenessHUD` header (next to the maximize button). One screen: ping types (source vs briefing vs pinned), size = confidence, ring = pinned, color = tier. One line per item. Closes on outside click.
- On the radar canvas itself, add a subtle hover/tap label (text node) so a user can see what a ping means without opening the drawer. Mobile = tap shows the label for ~2s before opening the drawer (already opens).
- Add a one-time "Tap a dot to see what it is" hint in the empty-state of the focused-ping panel.
- **Per-source ping detail**: when a `src:*` ping is opened, render a small description card derived from its tier (Official/Local/Community/Web/AI) + a plain sentence: "Open-Meteo is feeding weather here. Last sweep 12 min ago." No new data — just better copy mapping from the existing label.
- **Honesty about position**: add a one-line caption under the canvas in the expanded drawer: "Ping positions are visual only — they don't represent compass direction." Removes the implicit lie.

Files: `AwarenessHUD.tsx` (+ a tiny new helper `RadarKey.tsx` if it keeps HUD readable).

### Stage C — Layer chips become radar filters
- Lift a `layerFilter` state into `AwarenessSurface` (or pass via a small context). When set, `AwarenessHUD` receives it and:
  - Briefing pings matching the layer **glow** (existing strong style + slight scale).
  - Unrelated briefing/source pings **dim** to ~30% opacity.
  - A compact summary strip appears under the canvas: title + one plain sentence drawn from `latestBySection[layer].signal.short_summary`, plus 1–3 actions from `available_routes` of that signal.
- Tapping the same chip again clears the filter. Tapping a different chip swaps. Add an "All layers" clear.
- The existing `SectionDrawer` becomes the **View full detail** action from the summary strip, not the primary side-effect of tapping a chip.
- Source tier chips keep working alongside layer filter (independent axis).

Files: `LayerChips.tsx`, `AwarenessSurface.tsx`, `AwarenessHUD.tsx`.

### Stage D — Locate / Recenter / Confirm Place (shared state, cheap by default)
Add to `AwarenessProvider`:
- `locating: boolean` and `locate(opts?: { confirm?: boolean }): Promise<void>` — wraps `navigator.geolocation.getCurrentPosition`, updates the active place's `geo`/`updated_at` (cheap insert/update on `awareness_places`, no edge call), then calls existing `refresh()`. Does **not** invoke `awareness-snapshot` or any paid call.
- After a successful locate, **prompt** (not auto-run): toast with action "Scan this area?" → only then call `refreshSnapshot(true)`.

UI:
- `MiniRadarStrip` header: add a **"Locate me"** ghost button (MapPin icon). When `place.updated_at` is older than 30 min, label becomes **"Update position"**. When the current snapshot has a `location_warning`, label becomes **"Confirm place"** and tints warn.
- `AwarenessSurface` place strip: add three small controls inline — **Recenter** (re-runs locate), **Refresh position** (locate + cheap), **Confirm place** (opens the places list focused on save/rename).
- Both surfaces continue to share `useAwareness().place` — no duplicate state.

Files: `AwarenessProvider.tsx`, `MiniRadarStrip.tsx`, `AwarenessSurface.tsx`.

### Stage E — Terrain layer (no new API)
- Add a `terrain` derivation in a new tiny helper `src/lib/terrainSignal.ts`. Input: `snapshot.compact`, `snapshot.full_data`, `place.geo`, `place.country/region`, `location_warning`. Output: a `VantaSignal` with `signal_type: "terrain"`, plus a `terrain_kind` enum (`coastal | roadside | hill | urban | commercial | remote | offshore | unknown`).
- Classification rules (cheap, deterministic):
  - If `location_warning` present and offshore-ish → `offshore` + plain copy: "This reads offshore. Confirm your place first."
  - If reverse-geocode region/country contains coast/beach/island tokens → `coastal`.
  - If weather + altitude hints (when present) → `hill`.
  - Else fall back to `unknown` with the honest line: "I need a better location before I can read the terrain."
- Add **Terrain** as a 9th layer chip (extends `AWARENESS_SECTIONS` only at the UI layer; backend section list unchanged — the chip is rendered from a separate `TERRAIN` constant outside the awareness sections array, since there's no DB briefing for it).
- When the Terrain chip is selected:
  - Radar canvas applies a **restrained overlay** (subtle ring/grid/contour based on `terrain_kind`). Single SVG defs block, no animation chaos.
  - Summary strip renders the terrain `VantaSignal` via `SignalCard` (compact).
- No new pings. Terrain is an overlay + summary, not a data dot.

Files: new `src/lib/terrainSignal.ts`, `LayerChips.tsx`, `AwarenessHUD.tsx`, `AwarenessSurface.tsx`.

### Stage F — Source/capability off-state plain talk + freshness polish
- Replace tier chip tooltips with full sentences from the prompt's examples.
- Add a compact "Source status" line in the MiniRadarStrip when SerpApi is off: "External search is off — saved/cached info only."
- Normalize freshness rendering: a single helper `freshHuman(generated)` returning "live" / "12 min ago" / "needs a refresh" etc.

Files: `MiniRadarStrip.tsx`, `AwarenessHUD.tsx`, `SignalCard.tsx` (small).

---

## Part 4 — Acceptance per stage

- **A**: Word "Generate" no longer appears as a primary verb on Awareness or Command Center radar.
- **B**: A user can tap any ping or open the Radar Key and understand what it means in one sentence.
- **C**: Tapping a layer chip changes the radar visually and surfaces a one-sentence summary + actions for that layer.
- **D**: Locate Me works on both surfaces, never triggers SerpApi/deep Gemini, asks before scanning, and both surfaces show the same active place.
- **E**: A Terrain chip exists, no new tab; selecting it overlays the radar and shows a plain-talk terrain summary that fails honestly when location is weak.
- **F**: SerpApi-off and Community-off states each explain themselves in plain English wherever the user can see them.

---

## Part 5 — Technical notes (for the implementer)

- All new copy must run through `stripMarkdown` if it might contain LLM output. Static UI strings stay literal.
- Terrain classification stays in `src/lib/` — no edge function, no network call.
- `locate()` must respect the cheap-positioning rule: only `navigator.geolocation` + a single `awareness_places` update + `refresh()`. No `supabase.functions.invoke` from inside `locate()`.
- Layer filter state should live in `AwarenessSurface` and be passed to `AwarenessHUD` via a new optional prop (`activeLayer?: string | null`) — no new global context needed.
- Radar overlays use `hsl(var(--...))` tokens only — no raw colors.
- Mobile: keep all new chips/buttons tap-target ≥ 32px.

---

Recommended first batch: **Stage A + B together** (low risk, immediate legibility win), then **C**, then **D + F together**, then **E** last (most novel). Confirm before I start.
