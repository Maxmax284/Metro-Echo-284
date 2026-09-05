# Aware room: prove it, then finish it

Before adding anything new, the Aware room gets a real end-to-end test — data in the back, words on the screen — and the mismatches get fixed. Then the four new pieces land on top of a room we trust.

## Step 0 — Test the Aware room, front and back (first, before any new work)

What gets checked, on a 384px screen and against real records:

- Where you are: does the opening read match the pin actually stored, and does it say the honest thing when the pin is vague or stale?
- The four shelves (Now / Around you / Changed / Coming up): does each shelf's content come from a real record, and does a shelf with nothing to say get named once instead of showing an empty box?
- Trips: start a trip, end it, confirm the distance and the history line agree with the recorded points.
- Saved places: confirm the list reflects what's saved, and that switching place changes the opening read.
- Scan: confirm it only ever runs on a tap, and that the "what this touches" line is true.
- Today ↔ Aware: same place, same freshness, same wording — no surface claiming something the other denies.
- Every card gets the four-question test: what is this, what happened, what can I do, what happens if I tap.

Findings get written down, then fixed in the same pass: wrong wording, stale reads, shelves that show up empty, tap targets under size, anything the room claims but cannot prove. If a fix is bigger than polish, it gets called out rather than quietly skipped.

## Step 1 — What Vanta can see

The block exists but only lists senses. It gains:

- Location — on or off, plus what it is doing right now (using a pin you set, or nothing shared).
- Calendar — connected or not connected, and when it last brought something back.
- Telegram — connected or not, and the paired chat.
- One plain status line above the list: a single sentence on how much Vanta can currently see, so the state is readable without reading six rows.

Switches stay in Settings. This block reports only.

## Step 2 — Voice notes join the document lane

A voice note (recorded in the app or sent through Telegram) lands in the same lane as a PDF or Word file:

- The audio is turned into text, kept with the original.
- A plain summary in a few lines — what this was about.
- One next-step line — what it looks like this is asking for, phrased as a suggestion.
- Provenance on the card: where it came from, when, and that the text was heard rather than typed.

Nothing acts on it. It waits to be filed or approved like any other document.

## Step 3 — Telegram messages get their own lane

Text messages arrive as first-class items:

- In Today, under what matters right now, when they are unfiled or look time-sensitive.
- In the Aware room, on the Now shelf as recent arrivals.
- Each carries provenance (who sent it, when, which chat) and a "Why this?" tap that names the reason it surfaced and the record behind it.

Still capture-only. Nothing sends and nothing executes from a message.

## Step 4 — A map in the Aware room

A real map, not just the pin-fix dialog buried in recovery:

- Saved places as markers, tappable to switch place.
- Recent trips drawn as lines with their date and distance.
- Your current place as a draggable pin — drag it, confirm, and the read above updates with a note that you set it by hand.

Loaded only when opened, so the room stays quick.

## Technical notes

- Aware verification uses Playwright at 384px against the running preview plus direct reads of `awareness_places`, `trip_points`, `awareness_snapshots`, `awareness_briefings`, `telegram_messages`, `ingested_files` to compare screen copy against stored rows.
- `WhatVantaSees.tsx` extends from `useSourceHealth` + `calendar_feeds` + `telegram_chat_links`; no new tables.
- Voice: Telegram webhook gains a `voice`/`audio` branch that pulls the file, transcribes via the Lovable AI gateway, and writes into `ingested_files` with kind `voice`; summary + next step reuse the existing document extract path.
- Message lane reuses `telegram_messages` with `whySurfaced` for the reveal; Now shelf gains an arrivals group in `awarenessShelves.ts`.
- Map uses the Leaflet setup already present in `MapPickerDialog`, extracted into a lazy-loaded `AwarenessMap` fed by `useTrips` and saved places.
