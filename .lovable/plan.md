# Screenshot to flight truth — audit, and the small remainder

Audit only below. Nothing was changed.

## A) What already works

- A picture forwarded in Telegram is downloaded, kept in storage as the original evidence, and filed once per message (resends do not duplicate it).
- That picture is read for text, and travel-looking text goes through the same flight reader as forwarded typed text — no separate path.
- The reader understands a spelled-out airline ("Thai Airways Intl Flight 6285" becomes TG6285), airport codes in brackets, a confirmation code, and separate departure and arrival dates, so an overnight arrival lands on the correct day.
- If the flight is already on record, new evidence only fills blanks. Facts already held are never overwritten, and airline-owned facts (status, gate, terminal, delays, cancellation) are never taken from a picture.
- Disagreements are recorded as a conflict with a receipt and a question, not a silent change.
- Every outcome leaves a receipt in Receipts, provenance grows on the flight (which message, which line, what it contributed), and the picture stays linked to the flight it spoke about.
- Same-day proof on the real record: the passenger name was filled from evidence, and a mismatched departure time produced a conflict and changed nothing.
- Flights feed Today, the day rail, Flights, Ask, and Telegram from one record, and alerts use the one shared delivery rail (phone first, Telegram fallback, one acknowledgement).

## B) Telegram image handling

Working. Receive, download, store, read for text, and route into the flight reader are all live. The only unproven step is a real photo end to end; every text-level proof passed.

## C) Which capture path to reuse

The existing one, unchanged: Telegram capture writes a filed-item record and a note, then hands the text to the flight reader. Email, uploads and pasted text already converge there.

## D) Which flight parts to reuse

Existing flight reader, existing filing and removal, existing reconciliation, existing airline-status provider with its daily read budget and travel window, existing cross-links for evidence, existing receipts, existing Telegram commands and confirmations. No new component.

## E) Remaining gaps

1. **The booking site reference is dropped.** The Priceline trip number in the screenshot is not captured, so the flight cannot be tied back to where it was booked.
2. **A conflict has no way to settle.** It shows in Today with a raw internal label and no choice — there is no "keep what I have" or "the picture is right" action, so the question can only be dismissed.
3. **An unclaimed flight is never verified.** The airline check only runs for flights already claimed as yours, so a screenshot draft waiting on "is this yours?" gets no operating-carrier, codeshare or status confirmation.
4. **The human sentence around the picture is discarded.** The family note ("book the island flight only once on-time arrival is known") is captured as text but does not become a condition attached to the flight.
5. **A real photo has not been proven** through Telegram yet.

## F) Smallest plan to close them

1. Recognise the booking-site reference (trip/itinerary number) in the reader, store it on the flight, and show it as provenance.
2. Give the conflict a plain-English label and two actions in Today: keep what is on record, or accept the screenshot's version. Either choice writes a receipt; accepting writes the field.
3. Extend the airline check to flights still awaiting a "yours?" answer, once, inside the existing daily read budget and travel window — read only, no booking, no login.
4. Turn a condition sentence into one waiting promise linked to the flight ("wait for on-time arrival before booking the island leg"), which the existing flight-arrival signal can later release.
5. Prove the whole thing with the real screenshots in Telegram.

## G) Auto-merge versus staged for review

Filled automatically: blank origin, destination, departure and arrival times, booking code, booking-site reference, passenger name — only when the record is blank there.

Always waiting on you: ownership of a newly noticed flight, any disagreement with a fact on record, any change to an approved calendar entry, any condition turned into a promise, and every airline-owned operational fact.

## H) Source priority

1. What you confirmed yourself.
2. The airline feed, for current facts only — status, gate, terminal, delay, cancellation, operating carrier and codeshare.
3. Booking evidence (screenshot, email, confirmation) for itinerary facts — route, dates, times, codes.
4. Echo's own inference, last, and always labelled.

A lower source never overwrites a higher one; it fills a blank or raises a conflict.

## I) How we prove it

In Telegram, with the real images:
1. Send the confirmation screenshot. Expect one flight draft, the ownership question, the picture kept and linked, and a receipt.
2. Send the same screenshot again. Expect it recognised as already known and nothing new.
3. Send a second screenshot of the same trip that adds a fact the record lacks. Expect that blank filled and provenance naming the picture.
4. Send an altered screenshot with a different departure time. Expect no change, a conflict, and the two settle actions.
5. Answer "yes, mine". Expect one airline check, gate and status from the feed only, and no duplicate alert on phone and Telegram.
6. Check Today, Flights, Ask, and Receipts show the same single truth.

## J) Outside limits

Airline data is rate-limited (40 reads a day, only inside the travel window) and a far-future date may return nothing — absence is reported as unknown, never guessed. Codeshares can report under the operating carrier rather than the number printed on the screenshot. Reading a picture can misread characters, which is exactly why a picture may only fill blanks. Priceline itself is not connected and will not be called.

## Recommended next boundary

Do only the four fixes above, then run the Telegram proof in that order. Nothing else: no new room, no Telegram-only state, no second notification path.
