# Clarity and motion system

## Section descriptions

- One line, under the section header, plain English, ends in a period, under 80 characters.
- Lives in `SECTION_NOTE` in `src/lib/roomCopy.ts`. Nowhere else. Renaming a key intentionally resets the helper count for that section.
- Rendered by `<SectionNote sectionKey="...">`. Never hand-write a description paragraph in a surface again.
- No jargon. Tested: `src/test/room-clarity.test.ts` fails the build if a note leaks words like payload, schema, webhook, RLS.

## Adaptive helper copy

- `useHelperFamiliarity(key)` counts visits per device in `localStorage` (`vanta.helper.<key>`).
- Visits 1–3: the full line shows. Visit 4 onward: it collapses to a small info affordance which reopens it on demand.
- Counts are local. This is a reading habit, not account state, and it never costs a round trip. In private mode the line simply stays expanded — the safe side.

## Micro-onboarding

`ROOM_INTRO` in `roomCopy.ts` holds one line per room. No carousel, no multi-screen tour.

## Contextual "explain this"

- `ExplainThisButton` sits in each room header.
- The answer is written down (`ROOM_EXPLAIN`), so it is grounded and free — Vanta never guesses what a screen is.
- The popover ends with a hand-off that prefills Ask with "Explain what I'm looking at in <room> right now." Nothing sends automatically.

## Motion doctrine

```text
live data     -> arrives   slide from left, rail draws, locks     MOTION_ARRIVE
history       -> settles   presses in, scales to rest             MOTION_STAMP
user action   -> confirms  press, commit                          MOTION_PRESS / MOTION_COMMIT
navigation    -> travels   matched layout                         flip.ts / MOTION_SHEET
background    -> still     nothing loops
graffiti      -> still     paint never animates
light/weather -> may shift once, on real state change
```

Rules:

- Both new classes are one-shot. Apply only to rows genuinely new to this session; never on re-render.
- Bursts: the first three arrivals animate, the rest settle instantly. No staggered casino effects.
- Every class degrades under `prefers-reduced-motion: reduce` and scales with the Feel knob (`--feel-k`, `feelMs()`).

## Progressive disclosure

Default layer is the count and the one line. Then the section note, then the row, then the source, then the action. Never all five at once.

## Room-specific motion

- Today: live arrival in Happening now, stamped settle in What changed.
- Work: rows lift, desks travel into the surface they open.
- Ask: threads stream with a live dot; no bubble theatre.
- Receipts: new receipts stamp; tapping one unfolds in place.
