# Full tactile pass: audible sound, visible life

## Goal
Make the street identity something you actually notice: sounds you can hear, walls you can see, and motion on the moments that matter. Doctrine holds: art stays behind content, walls stay still (only the light moves), one tag per room, the calm-day dimming stays, reduced motion is respected, and sound stays opt-in.

## 1. Sound you can hear
- Make every sound louder and longer: the clack goes from 25ms to about 45ms and roughly 2.5x the gain. Spray, stamp and snap get a similar lift. A master volume sits in front of all of them.
- Unlock audio on the first tap. Phones keep audio suspended until a touch happens, which is probably why nothing played.
- Put a visible "Street sound" switch in the top shell next to the scope switch (a speaker icon), not only in Settings → Feel. Turning it on plays a test snap.
- Add a room-change turnstile click and a quick "zippo" snap when the Ask input opens.

## 2. Walls you can see
- Raise the painted wall's visibility on each room (roughly 1.5 to 2x), keeping the scrim under the text so it stays readable at 384px.
- Keep the calm-day dimming, but make it gentler.

## 3. Motion on real moments
- **Dawn shutter (Today):** the first open of the day plays a single 700ms shutter lift over the header, with orange light bleeding through. Once per day, per device.
- **Solari headers:** room titles and the Today count flip once when you enter the room. The words themselves don't change.
- **Stamp in Receipts:** new receipts land with a slight tilt and an ink-bleed edge, plus the thud. Only new receipts get this, never old ones.
- **Sticker slaps:** status and priority badges get a creased-corner sticker look and slap on once when they first appear.
- **Radar sweep:** a single sweep across the route map, only when a live position is shown. Never on estimates.
- **Spray ring:** the capture spray gets bigger, with speckles that fade over about 900ms.

## Not doing
- No chalk scratchpad this pass (it's a new capture surface, so it goes to a later pass).
- No animated walls, no loops apart from the existing light breathing, and no data or schema changes.

## Verification
Typecheck, the full test suite and the motion-rule tests. A Playwright pass at 384px and at desktop width, including reduced motion. You'll need to check sound yourself on your phone.

## Technical details
- `streetSound.ts`: add a master GainNode, raise the per-kind gains, add `unlockAudio()` on the first pointerdown, and add new "turnstile" and "zippo" kinds.
- Shell: a `SoundToggle` component; `setRoom` in `skins.ts` calls play("turnstile").
- CSS (`index.css`): raise the `.vanta-bd-wall` opacity per room; add `.dawn-shutter`, `.sticker-slap`, `.radar-sweep` and the stamp tilt keyframes, each added to the reduced-motion block.
- Reuse `SolariBoard` for room headings, using a once-per-mount key.
