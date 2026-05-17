# V3 Stages 6 + 7 — Street Signal · Motion + Mobile

## 6 — Street Signal (source hierarchy, kill-switched)
- Added a `tierFor()` classifier mapping each `sources_used` string into a tier:
  Official · Local · Community · Web · AI.
- HUD card now renders a compact **tier-count chip strip** (replacing the flat per-source chips).
  Community tier renders struck-through + "off" when SerpApi is paused — the same kill switch
  governs street/community ingest today.
- HUD drawer now renders a full **Source hierarchy** panel listing each tier with its hint
  ("Maps, nearby places, transit", "Reddit, forums, local chatter (kill-switched)", etc.)
  and the underlying source names beneath each tier badge.
- No new edge functions, providers, or schema; piggybacks on existing `apiGuard` switches.

## 7 — Motion + Mobile pass
- New `radar-fade-in` keyframe applied to each ping `<g>` with the existing stagger delay,
  so pings emerge instead of snapping in.
- New `motion-drawer-in` utility + `drawer-slide-up` keyframe (available for any panel
  that wants a softer slide).
- `prefers-reduced-motion` block extended to disable all four animations.
- HUD header row switched to `flex-wrap` so the SerpApi pill + Expand + Refresh buttons
  reflow cleanly at 384 px instead of clipping.

## Notes
- Out of scope: real Reddit ingest. The Community tier surface is now ready for a future
  guarded fetcher behind a `reddit_enabled` switch — the UI already speaks the language.
- All V3 spec stages now complete.
