# Airport clarity pass: one obvious next move

The operating-carrier work landed yesterday. What is missing now is not capability, it is
hierarchy: on the Flights screen the flight number appears four times, two lines disagree
about the gate, and the one sentence that tells you where to walk sits below a map. This
pass moves the answer to the top and deletes what competes with it. No new room.

## A) What already works

- Both identities are modelled and filled from the airline's own reading: marketing
  (Thai Airways TG6285) and operating (EVA Air BR3), with displaced identities kept as
  aliases instead of vanishing.
- The board sentence is written and correct: "Look for EVA Air BR3 to Taipei on the board.
  Your ticket says Thai Airways TG6285, and the board will not."
- The next-move line exists and is phase-aware (before airport / find check-in / no gate
  filed / gate posted / boarding / in air / landed), derived and never stored.
- Ask and Telegram both answer the terminal question with the operating carrier, and both
  state the journey's own origin airport and refuse to guess a different one.
- Check-in lookup reads one official page, cites host and read date, and says nothing when
  the page says nothing. Verified live: EVA's site and the Dulles site carry no zone.
- Gate, status, delay and cancellation stay provider-only; screenshots stay evidence.

## B) What is missing

1. Today never mentions any of it. The travel row is built from calendar entries only — no
   operating carrier, no next move, no gate. A traveller in a taxi sees the itinerary.
2. Nothing records "I am through security", so the gate-watch phase is only reachable when
   a journey has two legs. On a direct flight the card stays on check-in until a gate posts.
3. No airport-name disambiguation. Saying "Dallas" gets the journey's origin read back, but
   Echo never names the collision (Dallas is DFW, your journey leaves Dulles/IAD).
4. Boarding has no own moment. It is a wording change inside the same line.

## C) What is confusing today

- The flight number is printed four times per card (rail, split-flap board, confirmed row,
  status line) and the confirmed row reads "TG TG6285" — a carrier code stuttering into its
  own flight number.
- The split-flap board shouts the ticket number while the line under it says to follow a
  different airline. That is the exact confusion we set out to fix, now on one screen.
- The journey rail prints "no gate filed" on the leg while the board above prints GATE B49.
  Same screen, two answers.
- The deck opens with a 2xl title, two 3xl numbers, a "what changed since this phone last
  looked" panel, every leg with an override menu, then three caveat lines — and only then
  the next move.
- "That didn't happen", "your word", "worked out from the clock", "Stand", "NO POSITION"
  are all jargon a tired traveller has to decode.

## D) Smallest implementation plan

1. **Lead with the move.** The next-move line becomes the first thing on the Flights screen
   and inside each flight card: one bold sentence, at most two quiet lines under it, then
   everything else. Nothing new is added; the block moves and the rail drops below it.
2. **One identity, one place.** The split-flap board shows the board identity (EVA AIR BR3)
   when a codeshare exists, with the ticket number as a small alias under it. Remove the
   duplicate flight number from the confirmed row and fix the "TG TG6285" stutter.
3. **One gate answer.** The journey rail reads the same live gate the board reads, so a
   posted gate cannot appear as "no gate filed" two inches away.
4. **A single ground tap.** One control on the card: "I'm at the airport" → "I'm through
   security" → "At the gate". Device-local, no table, no execution; it only moves the
   emphasis of the line already being computed. Clearing it is one tap.
5. **Today carries the move.** When a journey is under way, the Today travel row shows the
   same one sentence and nothing else new — same wording, same source, no second card.
6. **Name the airport collision.** When a stated airport resolves to a different code than
   the journey's, Echo says both plainly and asks which, from the kept airport table only.
7. **Strip the deck.** Fold the three caveat lines into one, collapse the leg rail behind
   "Full journey" once a journey has a live leg, and put "That didn't happen" inside it.

## E) Source hierarchy

| Question | Authority |
| --- | --- |
| Who flies the aircraft | provider codeshare block, then booking evidence, then you |
| What to search on the board | operating carrier + operating number, always |
| Check-in airline | operating carrier |
| Check-in zone or counter | one official page, with host and read date; you overrule |
| Terminal | provider reading, then official page; the terminal board wins |
| Gate, boarding, status, delay, cancellation | provider reading only |
| Baggage, immigration, ground transport | kept airport and country tables |

Screenshots and booking sites stay evidence for itinerary facts and are never authority for
an operational one. A disagreement is surfaced for you to settle, never overwritten.

## F) Airport-phase hierarchy

```text
before airport   Get to Dulles.            board identity · terminal as filed
find check-in    Check in with EVA Air.    zone if read · terminal · ticket alias
through security No gate filed yet —       watch the board under EVA Air BR3
                 the board posts first.
gate posted      Gate B49. Head that way.  terminal · board identity
boarding         Gate B49. Boarding now.   time left
in air           In the air to Taipei.     arrival gate if filed
landed           Immigration, bags, exit.  local time · money · emergency number
```

One lead line per phase. The lead changes; the layout never does.

## G) Test cases

Codeshare (TG6285 / EVA BR3, IAD→TPE):
1. Screen opens on "Check in with EVA Air first" — no scrolling, no map above it.
2. Board reads EVA AIR BR3 with "ticket TG6285" small underneath; the number appears once
   more at most on the whole screen.
3. Tap "I'm through security" → lead becomes the departures-board line under EVA Air BR3.
4. Once B49 is filed, board and rail both read B49; no "no gate filed" anywhere.
5. Inside 40 minutes the lead reads boarding.
6. Today's travel row reads the same sentence as the card, once.
7. Ask "I just got to the terminal, where do I go?" → same sentence, same carrier.
8. Say "I'm at Dallas" → Echo names Dallas (DFW) against Dulles (IAD) and asks which.

No codeshare (a plain TG601):
9. Board reads THAI AIRWAYS TG601 with no alias line and no mention of a second carrier.
10. Lead reads "Check in with Thai Airways" — the operating fallback is silent, not stated.

## H) External blockers

- Check-in zones and counters have no API anywhere. They live on airline and airport pages,
  change by season and hour, and EVA's own page does not publish Dulles counters — verified.
  A zone is always a dated page reading or nothing.
- Codeshare coverage is good on scheduled long-haul, not guaranteed. Missing means unknown.
- Boarding time is rarely filed; boarding stays derived from the departure clock.
- The 40-reads-a-day ceiling and the flight's own window stay exactly as they are.

## I) Three-second traveller test

- [ ] First thing on screen is a verb, not a time.
- [ ] The airline named is the one on the terminal signage.
- [ ] No number or label appears twice on one screen.
- [ ] No two lines disagree.
- [ ] An unknown reads as one short sentence with a next step after it.
- [ ] Everything needed to walk is above the fold at 384px.
- [ ] No word on the screen needs explaining: no "stand", no "your word", no "derived".

## Technical notes

`groundPath` and `flightIdentity` stay as they are — pure, tested, no new state. The pass is
presentation plus one device-local ground flag: `FlightDesk` reorders (GroundLead first,
`JourneySpine` collapsed below), `FlightLive`'s Solari board takes `boardIdentity` instead of
`live.flight_no`, `JourneySpine`'s `LegRow` reads the live gate, `TravelLane` renders the
same `GroundRead` for an active journey, and the ground flag lives in `localStorage` keyed by
plan id (no migration, no audit event — it changes nothing but emphasis). Airport
disambiguation is a small pure helper over the kept airport table with tests, used by
`flightRead` for Ask and Telegram.

## Recommended first

Items 1, 2 and 3 — lead with the move, one identity, one gate answer. They are the whole
three-second test and they only move and delete code that already exists, so they can ship
and be read on a phone within the hour. The ground tap and Today's line follow; the deck
strip and the airport-collision wording land last.
