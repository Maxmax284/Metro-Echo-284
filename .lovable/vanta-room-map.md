# Vanta room map

Four rooms. The map is data (`ROOM_MAP` in `src/lib/roomCopy.ts`) and one static screen at `/how` ("How Vanta Is Organized"). No tour, no carousel, no steps.

## Today — What matters now.

Owns: Live activity · Current attention · Agenda · Recent changes

## Work — Where ongoing work lives.

Owns: Projects · Commitments · Actions · Artifacts · Memory · Deeper tools

## Ask — Talk to Vanta with context.

Owns: Threads · Files · Research · Questions · Prepared work

## Receipts — What happened and why.

Owns: State changes · Approvals · Actions · Audit history

## Explain This integration

`ExplainThisButton` sits in every room header. The popover holds the grounded room explanation (`ROOM_EXPLAIN`), a hand-off that prefills Ask, and a link: **See how Vanta is organized** → `/how`. The user never has to navigate Settings to find the structure.

## Rules

- Object names on the map are the canonical nouns from `vantaNouns.ts`. If a noun changes there, it changes here.
- The map describes structure only. It never reads live state.
- Adding a room to this map would mean adding a fifth room, which the architecture does not allow.
