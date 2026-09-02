# Vanta Unified Polish — 384px walk

Walked every room at 384px wide, the narrowest phone we design for. Notes are
what a first-time user would see, not what the code intends.

## Today
- Desk line, bulletin and the panel stack all hold at 384px; nothing clips.
- Expand all / Collapse all stays reachable without horizontal scroll.
- Body panel now shows readings in a workspace instead of reading as empty.
- Every panel says what happens on tap and where the data lands.

## Work
- Three tiers hold: desk tiles, then the desk, then the item.
- Desk tiles carry the clipped corner (`vanta-cut`) — reads custom, still legible.
- Quick actions wrap to two rows rather than squeezing labels.

## Ask
- Thread spine groups into Pinned, Recent, Archived with search above.
- Live dot and Stop answering both sit inside the safe width.
- Composer attachment strip scrolls sideways instead of pushing the send button.

## Receipts
- Slips stay readable; long titles truncate with the timestamp locked right.

## Settings
- Eight grouped categories, each collapsed by default. Connections rows show a
  tone lamp plus a proof line, so state is readable at a glance.

## Standing rules confirmed
- Every room answers the same six lines through the help sheet: purpose, what
  comes in, what it can do, the law, next step, and what empty looks like.
- Motion timings all come from tokens; no hardcoded durations left in the files
  touched this pass.
- Nothing moves unless something changed.

## Notes for the next pass
- Signed-out deep links bounce to `/auth`, so an automated walk of `/work` and
  friends needs a session before it can report anything useful.
- A few older panels still write their own headers rather than using the shared
  room header; harmless today, worth unifying when they are next touched.
