
# Stage C — Layer chips become radar filters

Make the 8 layer chips actually filter the radar instead of just opening a drawer.

## Changes

### `AwarenessSurface.tsx`
- Add `activeLayer: string | null` state.
- Tap on a chip: if same as active → clear; else set as active. Drawer no longer auto-opens.
- Pass `activeLayer` and `onPick={setActiveLayer}` to `LayerChips`.
- Pass `activeLayer` to `AwarenessHUD`.
- When `activeLayer` is set, render a compact **summary strip** under the HUD:
  - Title (capitalised layer name) + "Clear" button + "View full detail" button (opens existing `SectionDrawer`).
  - Body: `latestBySection[activeLayer]?.signal.short_summary` via `SignalCard` in `compact` mode, or a plain-talk fallback when missing: "No read for this layer yet. Tap **Scan layer** to assemble one." with a Scan button (calls `generate(activeLayer)`).
  - Up to 3 routes from `available_routes` (reuse `useSignalRoute`).

### `LayerChips.tsx`
- Accept optional `activeLayer?: string | null`.
- Active chip → ring-2 + primary tint; inactive chips when something is active → opacity-60.
- Add a small "All layers" clear chip when something is active.

### `AwarenessHUD.tsx`
- Accept optional prop `activeLayer?: string | null`.
- In the ping render: if `activeLayer` is set, briefing pings matching it stay full opacity + slight scale (1.4x radius); other briefing pings and `src:*` pings dim to ~30%. Pinned pings stay visible at 60%.
- No change to the source-tier filter — it remains an independent axis.

## NOT in scope
- No backend changes. No new edge calls. Drawer wiring stays as-is — just no longer opened by chip tap.
- Terrain chip lands in Stage E, not here.

## Acceptance
- Tapping a layer chip dims unrelated pings, highlights the matching briefing ping, and shows a one-sentence summary + actions below the radar.
- Tapping the same chip again clears the filter.
- "View full detail" still opens the existing `SectionDrawer` for the deep read.
- Source-tier chips continue to work alongside the layer filter.
