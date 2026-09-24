# Full tactile layer: flaps, stamps, stickers, living walls

Four pieces. Each one builds on something that already exists (the flip board, the receipt stamp, the sticker slap, the room wall art), so nothing is duplicated. Sound stays opt-in, reduced-motion users get the same words with no movement, and the art always stays behind the content.

## 1. Solari flips on arrivals
- New things landing in Work ("Arrived") and on Today ("What landed") get a short split-flap header, like "JUST IN" or "3 LANDED", that flips once when a new item arrives and then holds still.
- Each new row lands with a quick flap flip, paired with the new real flap sound.
- It never loops. It only flips when the count or wording actually changes, never on a plain refresh.

## 2. Heavy stamp on Receipts
- Every new receipt lands with a rubber-stamp hit: it scales down onto the slip, the ink bleeds slightly, the card shakes a little, and the new stamp sound plays.
- Stamp wording follows the recorded event (FILED / APPROVED / RAN / UNDONE / NOTED), so nothing is made up.
- Only receipts that are new since you last looked get stamped. Older ones sit already inked.

## 3. Sticker badges on projects
- Each project card gets one die-cut sticker (tilted a few degrees, with a white edge and a soft shadow) showing its state: ACTIVE, QUIET, NEEDS YOU, or DONE, taken from real project data.
- The tilt and color are fixed per project, so the same project always wears the same sticker.
- It slaps on the first time a card appears, with the snap sound. It's static after that.

## 4. Full wall textures for Today and Ask
- Today: the dawn wall gets layered grain, drifting light that changes with the time of day, and a slow puddle-light shimmer at the bottom edge.
- Ask: the alley wall gets flickering neon edge light, spray over-mist, and a faint drip texture. While Echo is thinking, the neon brightens a little.
- The walls themselves never move; only the light over them changes. Calm-day dimming still applies, and the readability layer over the art stays tuned so text passes contrast at 384px.

## Guardrails
- No database changes, no AI calls, no new rooms.
- Every animation is a one-off event, never a loop, except the slow wall light, which stops for reduced-motion users.
- Checked at 384px on Today, Work, Ask and Receipts before publishing.

## Technical details
- Reuse `SolariBoard` for arrival headers in `ArrivalHomes.tsx` and the Today arrivals lane in `TodaySurface.tsx`. Add a `useChangedKey` guard so it flips only when the count or wording changes.
- Receipts: extend the existing stamp CSS in `index.css` (`receipt-stamp-heavy` keyframes: scale 1.6→1, a 2px shake, ink-bleed filter). Apply it in `ReceiptsFront.tsx` / `ReceiptSlip.tsx`, compared against a last-seen timestamp stored in localStorage. Call `play("stamp")`.
- Projects: new `ProjectSticker.tsx` that hashes the project id to a tilt and color token, maps state from existing project fields, and uses the `sticker-slap` class plus `play("snap")` once per session.
- Walls: add CSS layers under `html[data-room="today"|"ask"]` (a grain SVG data-URI, a time-of-day gradient custom property set from `skins.ts`, and neon-flicker keyframes). Toggle a `data-thinking` attribute from the Ask streaming hook. Everything lives in the `prefers-reduced-motion` and calm-day blocks.
- Colors come only from semantic tokens. The new tests cover sticker state mapping and the stamp-on-new-receipts-only rule.
