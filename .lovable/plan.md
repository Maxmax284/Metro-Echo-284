# Stabilize the Ask background

## What changes
- Remove Ask’s legacy CRT crawl, stepped neon flicker, voltage jitter, and pulsing brightness layers.
- Keep the painted alley artwork as one static room background with a steady, subtle lamp glow.
- Stop streaming state from changing the full-screen background; activity remains visible inside Ask’s existing controls.
- Verify Ask at desktop and phone sizes, including while Echo is responding and when switching rooms.

## Technical details
- Consolidate overlapping Ask-only rules in the global visual styles into one non-animated override.
- Remove the document-level `data-thinking` background coupling from Ask streaming state.
- Preserve all other rooms, Ask content, thread behavior, and room transitions.
