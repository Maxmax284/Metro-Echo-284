## Plan: SerpApi feedback + quick toggle

Two small additions, both wired to the same `system_controls.serpapi_enabled` row so changes propagate everywhere immediately.

### 1. Confirmation toast in Settings (API Control Room)

In `src/pages/Settings.tsx`, wrap the kill-switch `onCheckedChange` so toggling `serpapi_enabled` shows a sonner toast:
- on → `toast.success("SerpApi resumed")`
- off → `toast("SerpApi paused", { description: "Search, news, and local lookups will be blocked." })`
- on error → `toast.error("Couldn't update SerpApi")`

Keep behavior identical for the other switches (no toast spam), only special-case `serpapi_enabled`.

### 2. Quick toggle pill in Mini Radar Strip

In `src/components/shell/MiniRadarStrip.tsx`:
- Use `useIsOwner()` + `useSystemControls()`.
- Render a small pill next to the existing Refresh button, owner-only:
  - Label: `SerpApi: on` / `SerpApi: off`
  - Active = primary tint ring; off = muted ring with amber dot
  - Click flips `serpapi_enabled` via `update({ serpapi_enabled: !controls.serpapi_enabled })` and fires the same toast as #1.
- Disabled while `controls` is loading or while the request is in flight.
- Hidden entirely on the mobile drawer's compact header (kept inside the expanded drawer body to avoid crowding the 384px viewport), shown inline on ≥sm.

### Technical notes
- No schema changes — reuses existing `system_controls` row and `useSystemControls.update()`.
- No edge function changes — `apiGuard.ts` already reads `serpapi_enabled` fresh per request.
- Styling uses semantic tokens (`ring-border/60`, `bg-primary/15`, `text-amber-300`) — no raw colors.
- Toast helper extracted into a tiny local function in each file (two lines) rather than a shared util, to keep diff small.

### Files touched
- `src/pages/Settings.tsx` — special-case toast on `serpapi_enabled` switch.
- `src/components/shell/MiniRadarStrip.tsx` — add owner-only quick toggle pill + shared toast.
