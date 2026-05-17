# Awareness Radar UX Maturity

Make Awareness behave like radar instead of a report generator. No new data, no schema changes, no new edge functions. This is a behavior and layout correction across the Awareness surface, the HUD, and the Command Center mini-card — using signals, snapshots, and briefings that already exist.

## Operating principle

When the user opens Awareness, the first screen must answer five questions in one glance:

1. Where am I (and how sure is Vanta).
2. What are the top live signals right now.
3. What sources are feeding this (with trust tier).
4. What needs attention (warnings, stale, contradictions, low confidence).
5. Where do I tap for more.

Everything else — long prose, full briefings, raw snapshot, generation controls — moves into drawers, secondary chips, or owner-only affordances. "Generate" stops being a primary verb on the main view.

## Scope (5 focused changes)

### 1. Awareness surface: radar-first layout

File: `src/components/surfaces/AwarenessSurface.tsx`

Reorder the main scroll into a strict hierarchy:

```text
┌─ Place strip      "Spot · confidence chip · freshness · change place"
├─ AwarenessHUD     (already the radar — promote it, make it the hero)
├─ Top Signals (3)  Weather / freshest brief / highest-risk warning
├─ Attention queue  Stale sections, low-confidence items, location_warning
├─ Layer chips      transport · infrastructure · payments · etiquette · …
│                   (tap = open section drawer, NOT generate)
└─ Places list      (collapsed under "Switch place" — secondary)
```

Remove the "Quick generate" row of 8 zap buttons from the main view. Move it into a single owner-visible "Manage briefings" drawer reachable from a small kebab on the HUD. Same for the giant per-place modal with 8 generate buttons — keep the modal but make tapping a layer chip open a single-section drawer (read first, refresh as a secondary action).

### 2. Layer chips replace the section grid

New behavior for the 8 `AWARENESS_SECTIONS`:

- Each chip shows: section name + a tiny freshness dot (fresh/aging/stale/missing) + confidence tint.
- Tap a chip → opens a focused **SectionDrawer** with that section's `SignalCard` (already built), source labels, and a single "Refresh" button.
- No prose on the main surface. No 8-card wall.

New file: `src/components/awareness/LayerChips.tsx`
New file: `src/components/awareness/SectionDrawer.tsx` (wraps shadcn Drawer + SignalCard)

### 3. Attention queue (the "what needs you" row)

New file: `src/components/awareness/AttentionQueue.tsx`

Pure derivation from existing provider state — no new fetches. Surfaces, in order:

- `location_warning` from snapshot.compact (already rendered inline today)
- Any briefing with `confidence: "low"` AND `risk_level !== "none"`
- Any briefing with freshness `stale`
- Missing critical sections (hazards, scams, connectivity) when place is non-trivial

Each row is a tappable mini-card: title, one-line reason, tap → opens the relevant SectionDrawer or runs the safe action (e.g., "Refresh stale", "Open warning"). If queue is empty: show a single calm line — "Nothing pulling at your attention." No fake urgency.

### 4. AwarenessHUD trims and promotes

File: `src/components/shell/AwarenessHUD.tsx`

- Remove the redundant Top Signals list from the HUD when used inside AwarenessSurface (it will live one row below as its own block). Keep it when HUD is used in Command Center context. Add a `variant?: "hero" | "compact"` prop.
- Demote the "Refresh / Generate" button to a small icon-only control inside an overflow menu. Generation is not the headline action.
- Keep pings, pin behavior, Street Signal tier chips, SerpApi pill (owner). These are already correct.
- Add tap-to-filter: tapping a tier chip (Official / Local / Community / Web / AI) filters the pings + Top Signals to that source tier for the next 8 seconds, with a "Clear filter" pill. No persisted state.

### 5. MiniRadarStrip parity (Command Center)

File: `src/components/shell/MiniRadarStrip.tsx`

- Replace the inline source-label cloud with the same 5 tier chips as the HUD (one-glance trust hierarchy).
- Add a confidence dot next to the place name (matches `overall.confidence`).
- Tap the card body → routes to Awareness surface (existing nav). Refresh stays as the only explicit button.
- Drawer view: drop the raw JSON `<pre>`. Replace with Top Signals + AttentionQueue (read-only, no Refresh button beyond the existing one).

## What we are explicitly NOT doing this pass

- No schema changes. No new edge functions. No changes to `awareness-snapshot`, `awareness-brief`, or `awareness-decay`.
- No new section types, no new signal taxonomy.
- No Companion / Sherlock / Memory / Intake work — that comes after, in order.
- No shared-aggregation surfacing. Stage 7 stays gated.
- No "Generate everything" button. Generation stays manual, single-section, owner-initiated, behind the overflow.

## Technical notes

- All new components live under `src/components/awareness/` and consume `useAwareness()` + `useAwarenessSlice()`. No new providers.
- Freshness/confidence dots reuse the `FRESH_TONE` and `CONFIDENCE_TONE` token maps already in `vantaSignal.ts` and `AwarenessHUD.tsx`.
- SectionDrawer reuses `SignalCard` (already handles routes, feedback, long-detail toggle, source labels). Zero new rendering logic.
- AttentionQueue is a pure `useMemo` over `overall.briefings`, `overall.missing_sections`, `overall.freshness`, and `snapshot.compact.location_warning`.
- HUD's `variant` prop defaults to `"hero"` on the Awareness surface and `"compact"` in Command Center / mini contexts.
- All colors via semantic tokens (no raw hex). Tap targets ≥ 32px. Drawer behavior matches existing shadcn Drawer usage in MiniRadarStrip.

## Acceptance check

- Open Awareness: radar + place + top signals + attention queue + layer chips are visible above the fold on mobile, with zero long prose.
- Tap a layer chip: opens a drawer with that section's SignalCard. No generation happens automatically.
- Tap a tier chip on the HUD: pings + top signals filter to that tier; clears after 8s or on tap.
- Attention queue is empty when state is clean; non-empty rows are all tappable.
- Command Center mini-card shows tier chips and a confidence dot; no raw JSON anywhere in the drawer.
- No new tables, no new functions, no behavior change in `awareness-snapshot` or `awareness-brief`.

Next after this lands: Companion tool coverage (front-door identity shift).