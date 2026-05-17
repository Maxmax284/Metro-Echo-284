# Stage 3 — Awareness HUD (radar canvas · pings · top signals · drawer)

Replaces the text-only `MiniRadarStrip` with a real HUD on the Command Center.

## Files
- **NEW** `src/components/shell/AwarenessHUD.tsx` — SVG radar (concentric rings + crosshairs + sweep wedge), pings derived from `snapshot.sources_used` + non-empty briefings (angle = hash(label), radius = freshness bucket fresh/aging/stale → 20/30/40), top-signals list (weather, summary, freshest briefing), expand → `Drawer` with large radar + signals + sources + raw snapshot, preserves owner SerpApi pill + refresh.
- `src/index.css` — keyframes `radar-sweep` (4.5s linear) + `radar-ping` (2.4s pulse), `prefers-reduced-motion` disables both.
- `src/components/surfaces/CommandCenterSurface.tsx` — swap import + usage `MiniRadarStrip` → `AwarenessHUD`.

## Behavior
- Read-only canvas; refresh still calls guarded `refreshSnapshot()`.
- No new tables, edge functions, or providers.
- 384px-safe: radar 120px in the strip, gap-3 with side content.
- `MiniRadarStrip.tsx` left in place for now (no consumers) — can delete in a later sweep.
