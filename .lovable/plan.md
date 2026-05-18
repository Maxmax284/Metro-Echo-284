# Awareness Radar — Repair Pass Plan

## Audit summary (what's actually rendered, and why it still looks robotic)

**Render path:** `AwarenessSurface.tsx` and `SectionDrawer.tsx` both feed briefings into `SignalCard.tsx`. The smoking gun is on line 224 of `AwarenessSurface.tsx` (and 50 of `SectionDrawer.tsx`):

```ts
signal={b.signal ?? { title: activeLayer, short_summary: b.content, confidence: b.confidence ?? "low" }}
```

When the DB row has no structured `signal` JSON (every legacy row from before the Vanta-voice work), the full robotic Gemini paragraph is shoved into `short_summary` and rendered verbatim by `SignalCard`. No `why_it_matters` / `what_to_do_next` is computed, so the "structure" collapses into one giant prose blob — exactly what the screenshots show.

**Confirmed live components** (rendered, not orphaned): `AwarenessSurface`, `AwarenessHUD`, `LayerChips`, `SectionDrawer`, `SignalCard`, `AttentionQueue`, `MiniRadarStrip`. Previous Stage A–F work IS wired — the failure is purely the legacy-prose fallback path bypassing all structure.

**SERP status:** `MiniRadarStrip` has a SerpPill that reads `controls.serpapi_enabled` only. It does not distinguish enabled-but-not-called / cached / failed / blocked. No state for "external search is on, but no live scan yet."

**Location:** `recenter()` works on a single browser geolocation call. No accuracy gating, no offshore detection, no permission-denied messaging beyond a generic toast.

**Terrain:** No terrain layer exists in the radar. Previous prompts referenced it but nothing was built.

## Stages (small, verifiable)

### Stage R1 — Plain-talk normalizer (the actual fix for robotic text)

New file `src/lib/awarenessPlainTalk.ts`:

- `normalizeAwarenessSignal(section, briefing, ctx)` returns a `VantaSignal`.
- If `briefing.signal` is a valid structured signal → trust its `short_summary`/`why_it_matters`/`what_to_do_next`, push original `content` into `long_detail` only.
- If only legacy `content` exists → **never** pass it to `short_summary`. Instead:
  - Move full prose to `long_detail`.
  - Detect "no-useful-read" patterns: missing country/region, offshore (lat/lon over water heuristic from a simple bounding-box list, or just `!place.country`), or phrases like "hampered", "unavailable", "too broad", "insufficient", "cannot determine" → emit a confirm-place plain-talk signal per layer (see copy table below).
  - Otherwise extract first sentence as `short_summary`, infer `why_it_matters` and `what_to_do_next` from per-layer templates.
- Per-layer copy table (location-vague case):
  - transport → "Your location looks too broad right now. Confirm the place so I can give useful transport info."
  - payments → "This location looks offshore or misread, so I can't tell what payment options are nearby. Confirm your place first."
  - connectivity → "Connection info looks shaky because your location is too broad. Confirm the spot before relying on it."
  - hazards → "I can't trust the hazard read yet because the location is too vague. Confirm the place first."
  - scams → "I'm not seeing a useful scam read here because the location looks wrong or offshore. Fix the location before trusting this."
  - infrastructure / etiquette / timing → analogous one-liners.
- Always emits `available_routes: ["confirm_location", "use_saved_place", "refresh_signal"]` when in vague-location state.

Wire `AwarenessSurface.tsx` line 222–229 and `SectionDrawer.tsx` line 48–54 to call `normalizeAwarenessSignal(...)` and pass the result to `<SignalCard signal={...} />`. Drop the inline `b.signal ?? { ... b.content ... }` hack.

### Stage R2 — Honest SERP / source state

Extend `MiniRadarStrip` SerpPill into a small state machine reading: `controls.serpapi_enabled`, `snapshot?.sources_used` (presence of "serpapi"), `snapshot?.generated_at` freshness, and any `snapshot.full_data.errors?.serpapi`.

States + copy:
- on + no snapshot → "External search on · no live scan yet"
- on + serpapi in sources + fresh → "External search active"
- on + snapshot cached / stale → "External search cached"
- on + error flag → "External search failed — check key/quota"
- off → "External search off — using saved/cached info"

Same pill copy mirrored in `AwarenessSurface` place strip via a tiny shared `<SourceStatusPill />` component so users see the same truth in both surfaces.

### Stage R3 — Location safety + clear feedback

`recenter()` in `AwarenessSurface.tsx`:
- On permission denied (`err.code === 1`) → "Location permission is off. Enable it in your browser or pick a saved place."
- On position with `accuracy > 5000m` → still saves, but toasts "Got a rough fix (±Nkm). Confirm the place if it looks wrong."
- After successful update, toast offers "Scan local context" (CTA → `refreshSnapshot(true)`), never auto-triggers paid scan.
- Same "offshore guard": if new coords land in a water bounding box → toast "This looks offshore or misread. Pick a saved place or confirm manually." and still save (don't block).

### Stage R4 — Terrain as a real radar overlay

`AwarenessHUD.tsx`:
- Add `terrainMode: "water"|"urban"|"hill"|"road"|"unknown"` derived from `place.country/region` + simple offshore check (or `snapshot.full_data.terrain` if backend ever fills it).
- Each mode renders a distinct subtle SVG overlay inside the radar (water rings, grid lines, contour bands, route hint dashes, muted noise for unknown). All colors via existing semantic tokens (`primary/10`, `muted/30`, `accent/20`).
- Add a one-line terrain caption under radar matching the audit copy ("This looks offshore, so terrain context is not reliable yet." etc.).
- New chip "Terrain" added to `LayerChips` (9th chip) that, when active, dims pings and emphasizes the overlay.

### Stage R5 — Ping legend + tap meaning

Tiny `<RadarLegend />` toggle inside `AwarenessHUD` (info icon top-right of the radar). Opens a popover listing: briefing ping = layer read, source ping = raw source point, pinned = manual, dim = filtered out. Tapping any ping already opens detail — verify the tooltip content includes layer + confidence + source + plain summary (small patch to existing ping render).

### Stage R6 — Backend nudge (small, optional within this pass)

In `supabase/functions/awareness-brief/index.ts`, when the model returns a `signal` JSON, also write a structural sanity check: if `short_summary.length > 220` chars, truncate and dump full into `long_detail`. This prevents future legacy-style rows. Pure server-side guard, no schema change.

## Out of scope this pass
- Re-running awareness-brief over old rows (the normalizer makes that unnecessary).
- New tables, RLS changes, or schema migrations.
- Any companion/Sherlock surface changes.

## Acceptance gate

After R1 alone, the screenshots in the audit (hazards "significantly hampered", payments Gulf of Thailand prose, etc.) must visibly disappear from compact cards — those paragraphs will only appear under "View full detail" in the drawer. After R2 the SERP pill must show one of the six honest states. After R3 every location failure has a sentence, not a silent toast. After R4 picking the Terrain chip must visibly change the radar overlay.

## Execution order
R1 → R2 → R3 → R4 → R5 → R6, verified surface-by-surface in the preview. R1 is the highest-value, smallest, most isolated change — ship and verify before touching anything else.
