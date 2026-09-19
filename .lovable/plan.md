# Airport ground truth: who actually flies it, and where to stand

The live failure at Dulles was not a data outage. Echo had the itinerary and had nothing to say about the terminal, because the operating carrier was never modelled and the practical next step was never asked for. This closes that gap inside the existing journey — no new room, no Airport Mode.

## What the repo actually has today

**A) Data model**
- `flight_plans.options[]` carries only `airline` + `flight_no`. That is one identity. The TG6285 record on deck literally reads `airline: "TG"` and nothing else — no operating carrier, no alias, no board identity.
- `flight_plans.live_status` (a provider reading) carries departure/arrival `terminal` and `gate`. No check-in zone, no counter, no codeshare.
- `noticed_from` already carries sources, conflicts, and a booking reference — the right place for evidence, and it is already append-only.
- The kept airport table holds code, name, city, country, timezone. No terminal layout, no airline-to-terminal mapping, no check-in areas.

**B) What can supply the missing facts**
- The flight provider payload *does* carry a codeshare block and the airline's own code, and Echo currently throws both away while normalising. That is the single highest-value line of code in this whole audit: operating carrier and marketing alias are already arriving and being discarded.
- The existing web research path (`web-look` / page reading) can read an official airline or airport page for a check-in zone, with the page as the source.
- The places lookup behind the terminal intel card is a shop finder. It is the wrong tool for check-in counters and will not be used for them.

**C) Phase awareness that already exists**
- The journey model already computes where you are: before / at the airport / in the air / on the ground between legs / done / stopped, and the legs already carry a user override that beats the feed.
- Nothing downstream changes *emphasis* by phase. The deck shows the same plate throughout, Ask prints the same itinerary paragraph, and the ground state is only reachable as a manual override. Phase is computed and then ignored.

**D) Exact cause of the live failure**
1. Only one flight identity exists, so Echo could not say "look for EVA Air BR3".
2. The codeshare block from the provider is dropped during normalising.
3. There is no notion of a check-in area, so there was nothing to say before a gate exists.
4. "Gate not filed yet" is the terminal sentence instead of the first sentence — no next step follows it.
5. Arriving at the airport is only a manual override, so the room never shifts to ground questions on its own.

## The change set (smallest that closes it)

**1. Flight identity becomes a small set, not a string.**
Add an optional `identity` block to a flight option: marketing carrier + number, operating carrier + number, aliases, and the one line a traveller reads on a board. Every field optional; absent stays absent. No migration is needed — options is already free-form JSON — but the shape gets a single typed home and a test.

**2. Stop discarding the codeshare.**
Keep the operating carrier, its flight number and the airline code from the provider reading, and fold them into the flight's identity as provider-owned facts. This alone would have told Maxwell "EVA Air BR3" without anybody searching.

**3. One ground path read, derived, not stored.**
A pure module that answers one question — what do I do next — from facts already on record: find your carrier's check-in, check in and drop bags, security, gate pending or posted, boarding. It names the operating carrier and the board identity, states the terminal when a source carried one, and says plainly when a check-in zone is not on record rather than inventing Zone 2.

**4. Phase changes emphasis, not layout.**
The deck and the Today row keep exactly their current shapes and reorder what leads: leave time before the airport, carrier and check-in at the airport, gate and walk after security, progress in the air, immigration and money after landing. One lead line per phase. Nothing new is added to the screen; the order changes.

**5. Ask answers the ground question.**
"I just got to the terminal, where do I go?" resolves against the active journey and answers with the operating carrier, the board identity, the terminal if known, and the honest gap if the check-in area is not on record — plus an offer to look it up. If the stated airport disagrees with the journey (say "Dallas" against IAD), Echo asks which, from the journey's own evidence. It does not pick.

**6. Check-in zone is a looked-up fact with a receipt.**
When asked, one official-page read fills the check-in area, stored on the flight with the page as its source and a timestamp. Never guessed, never inferred from a shop listing, never claimed after the page changed without a fresh read.

## Authority, per question

| Question | Authoritative |
| --- | --- |
| Who operates the aircraft | Provider codeshare block, then booking evidence, then the person |
| What to search on the board | Operating carrier + operating number, always |
| Check-in airline / zone / counter | Official airline or airport page, with date read; the person overrules it |
| Terminal / concourse | Provider reading, then official page; the board in the terminal wins |
| Gate | Provider reading only; never a page, never inferred |
| Schedule / status / delay / cancel | Provider reading only |

Screenshots and booking sites stay evidence for itinerary facts and are never authority for anything operational.

**G) When provider and airline page disagree:** nothing is overwritten. The disagreement surfaces as a conflict the person settles, exactly like the existing "keep 01:15 / file the picture's version" flow, and both readings keep their source and time. For gate and status the provider stands and the page is ignored; for a check-in zone the page stands and the provider has no opinion.

**J) Reuse:** yes, entirely. Screenshot and Telegram intake, the reconcile rules (blanks fill, filled facts wait), the conflict settle flow, the delivery rail, and the receipts all stay as they are. Operating carrier and check-in area are two more facts flowing through the same pipes.

**L) External blockers:** check-in zones and counters have no API anywhere. They live on airline and airport pages and change by season and time of day. So a zone is always a dated page reading, never a live fact, and is always shown with the read date. Codeshare coverage from the provider is good on scheduled long-haul but not guaranteed; missing means unknown, not the marketing carrier. The daily read ceiling and travel window stay untouched.

## Recommended implementation boundary

In: identity block on the flight option; keep the provider codeshare and airline code; one derived ground-path module with tests; phase-led ordering on the existing deck card and Today row; the Ask ground answer with the airport-mismatch question; one page-read that fills a check-in area with its source.

Out: any new room, tab, Airport Mode or travel hub; a second state machine; stored phase; a terminal map or airport layout dataset; walking-time estimates from a floor plan; automatic background page scraping; any check-in, seat or bag action.

## Live test checklist — IAD → TPE tonight

1. Force a provider read on the flight and confirm the operating carrier comes back as EVA Air BR3 and is kept, with TG6285 retained as the marketing identity.
2. Flight card reads "look for EVA Air BR3 to Taipei on the board" with TG6285 named as the ticket number.
3. Mark yourself at the airport; the card's lead line becomes check-in, not leave time, with no new card appearing.
4. Ask "I just got to the terminal, where do I go?" and check the answer names EVA Air, BR3, the terminal if filed, and says the check-in zone is not on record.
5. Tap the look-up; confirm the zone is filled from an official page with the page and date shown as its source.
6. Ask the same question saying "Dallas" and confirm Echo asks which airport instead of answering.
7. Confirm gate still reads not filed, now followed by a next step rather than ending the card.
8. Same answer in Telegram, one notice, no duplicate.
9. Receipts show the identity fill and the zone look-up as separate entries with their sources.
10. At 384px, nothing new is stacked on the card — only the order of lines changed.

## Verdict: build it now

Yes, before the broader coherence pass. This is not an expansion, it is the operational half of a situation model that is already half built — the phases are computed and thrown away, and the operating carrier is fetched and thrown away. It is also the rare fix that makes the interface simpler: one lead line per phase instead of a plate that says everything at once. And it is testable tonight on a real flight, which will not be true again for a while.
