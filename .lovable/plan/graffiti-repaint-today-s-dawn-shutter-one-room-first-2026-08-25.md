# Graffiti Repaint — Today's Dawn Shutter (one room first)

Repaint the Today room's wall as real artwork instead of CSS gradients, and turn the intensity up so the paint is something you actually notice. Only Today changes; Work, Ask, Receipts and Settings keep their current CSS walls until you've seen this one.

## What you'll see

- Behind Today's content: a rolling steel shutter at dawn, one bold graffiti tag thrown across it, sodium-lamp bleed low-left. Painted, hand-done, not a pattern.
- Turned up loud (intensity 10 of 10) — the wall reads as a wall, but content still wins on contrast. Text and cards stay fully legible.
- The art sits behind everything, ignores clicks, and fades in over the existing 900ms wall transition so switching into Today feels like walking up to it.
- Ambient off, reduced motion, and the Minimal feel preset all still kill or calm it — no new escape hatches needed.
- Concrete skin keeps its cold treatment (desaturated, harder contrast) applied to the artwork.

## Build steps

1. Generate the artwork: a dark, cinematic photo-real-meets-painted rolling shutter wall at dawn with a single confident graffiti throw-up, one sodium lamp bleed, heavy grain, mostly dark with edge weight so the center stays quiet under content. Wide (1920x1080).
2. Host it as a CDN asset (`lovable-assets`) so the repo stays light, and keep the pointer at `src/assets/wall-today-dawn.jpg.asset.json`.
3. Feed the asset URL into CSS through a variable set once on the backdrop element, so `index.css` keeps owning all the visuals.
4. Rewrite `html[data-room="today"] .vanta-bd-wall` to layer, bottom to top: the artwork (cover, bottom-anchored), the existing shutter slats as a faint overlay for crispness at any size, and the sodium bleed. Raise `--bd-wall` from 0.5 to the loud end and loosen the center mask so the paint reads instead of hiding.
5. Verify at 384px mobile and desktop with screenshots — check contrast on Today's cards, bulletin, and nav, plus ambient-off and reduced-motion states.

## Technical notes

- `AmbientBackdrop.tsx` imports the `.asset.json` pointer and sets `--bd-wall-today: url(...)` as an inline style on the root backdrop div. No per-room React branching, no new component.
- `index.css` Today block: `background-image: linear-gradient(sodium bleed), repeating-linear-gradient(slats), var(--bd-wall-today)` with matching `background-size`/`position`/`repeat` triples. Center mask softened (transparent stop pulled in) so the wall isn't erased where content sits.
- `--bd-wall` for Today goes to ~0.85; the existing skin filter and `data-ambient="off"` / `prefers-reduced-motion` rules already cover the artwork since they target `.vanta-bd-wall`.
- No changes to skins.ts, motion prefs, or any other room's wall selectors.
