# Screenshot → flight truth: audit and the smallest build that closes it

Audit only. Nothing was changed. Everything below was read from the live repo.

## Short answer

The doorway exists and the flight brain exists. They are not connected.

A screenshot sent to Telegram is already downloaded, stored, filed in your Inbox and
looked at by Echo. A forwarded *text* booking is already read into a draft flight with
provenance and an ownership question. But a picture's words never reach the flight
reader, and when a booking matches a flight already on record Echo counts it as
"already known" and throws the new details away instead of merging or flagging them.

## A. What already works today

- Telegram accepts photos, image files, PDFs/Word and voice, downloads them, stores them
  in the `memory-uploads` bucket and files an `ingested_files` row with a first-pass type
  and Inbox status (`telegram-webhook/index.ts:1939-2250`). One message = one file, keyed
  on the Telegram update id, so a retry never doubles.
- Reading words off an image exists (`_shared/pageRead.ts` `ocrImage`, and `readPageFile`
  which writes the words into a note with a receipt).
- Looking at a picture exists as its own deliberate act (`_shared/lookAt.ts`,
  `perception-look`), with a receipt and an "I can't tell" outcome.
- Deterministic flight reading from text exists: flight code, named-month dates, 12/24h
  times, `AAA → BBB` routes, confirmation code, traveller names
  (`_shared/flightRecognize.ts`) — patterns only, no model, nothing invented.
- Filing that reading exists: a draft `flight_plans` row with `noticed_from` provenance
  (source, sender, evidence lines, confidence, the exact line it was read from), an
  ownership question when Echo cannot tell whose flight it is, and a `flight.noticed`
  receipt (`_shared/flightNotice.ts`). Telegram already runs this on inbound text
  (`telegram-webhook/index.ts:920-940`).
- Manual filing by number and removal with a confirm step exist on the desk and in
  Telegram (`_shared/flightFile.ts`, `telegram-webhook/index.ts:1298-1339`).
- Provider verification exists and is capped: a reading is stored as a timestamped
  reading (`live_status`, `live_checked_at`), diffed rather than overwritten
  (`_shared/flightStatus.ts` `statusDiff`), limited to legs near their filed time, 40
  paid readings a day (`journey-watch`, `flight-status`, `_shared/flightProvider.ts`).
- One delivery rail with one acknowledgement already carries flight news to Today, phone
  or Telegram — never two buzzes for one change (`_shared/delivery/reach.ts`).

## B–D. The reusable seams

Nothing new is needed for: the Telegram file doorway, storage, the Inbox record, OCR,
the flight reader, the draft-flight writer, the ownership question, the provider read
with its cap, the receipts, and the delivery rail. This build reuses all of them.

## E. The exact gaps

1. **A picture's words never reach the flight reader.** A plain photo goes to "look at
   this" (a prose answer kept in the file's metadata); only a document, or a caption
   saying "read this", runs OCR — and even then the resulting note is never passed to
   the flight reader (`telegram-webhook/index.ts:2267-2320`).
2. **The reader cannot read this screenshot.** It needs a carrier code glued to the
   number (`TG 6285`). "Thai Airways Intl Flight 6285" gives it nothing, there is no
   airline-name-to-code table, `Washington Dulles Intl Airport (IAD)` does not register
   as a route because a route must look like `IAD → TPE`, and a second calendar day for
   the arrival is read as if it were the departure day.
3. **A match is a dead end.** When the flight and day already exist, the notice path
   counts it as known and stops (`_shared/flightNotice.ts:122-134`). Missing details on
   the existing card are not filled in, and a detail that *disagrees* is not raised.
4. **The screenshot is not linked to the flight.** `noticed_from` holds one blob for the
   first sighting; there is no evidence link from the stored image to the flight, so
   Today, Ask and the desk cannot show "this came off the screenshot you sent".
5. **A recognised draft is never verified.** The watcher only reads legs already marked
   as yours, so a screenshot-born draft sits unchecked until someone claims it.
6. **Codeshare is unmodelled.** There is no field for "sold as this, flown by that", so a
   provider answer under a different carrier reads as a conflict rather than the same leg.

## F. Smallest build that closes only those gaps

1. **Read the words, then read the flight.** After a Telegram image lands, run the
   existing OCR when the words look like travel (carrier name, "flight", "confirmation",
   an airport code, a date) and feed that text into the existing flight reader. No new
   function, no new table: the same intake, one extra pass.
2. **Teach the reader three things** (pure module, no model): a small airline-name → code
   table so "Thai Airways … Flight 6285" reads as `TG6285`; an airport code taken from
   `(IAD)` / `(TPE)` in a full airport name, with departure and arrival taken in the
   order they appear; and an arrival day that is allowed to be the next calendar day.
   Anything still ambiguous stays unread, as now.
3. **A match becomes a reconciliation, not a dead end.** Compare the read facts against
   the filed flight and sort each one into: *fills a blank* (safe, applied, with a
   receipt), *confirms what is there* (recorded as a second source, nothing changed), or
   *disagrees* (nothing is touched — it is raised as one question).
4. **Keep the evidence attached.** Link the stored screenshot to the flight and append a
   provenance line, so the flight can always say which source each fact came from.
5. **Verify the operational facts through the provider, not the picture.** Status,
   operating carrier, gate, terminal, delay and cancellation come only from a provider
   reading, inside the existing cap and window. A screenshot never sets them.
6. **One reply, one card, one acknowledgement.** Telegram answers in the same thread with
   what it read, what it filled in, what it could not, and the same buttons the rail
   already uses. Today shows the same one item. No second notification.

## G. Automatic vs staged

Automatic: storing the screenshot, reading its words, recognising it as travel,
attaching it as evidence, filling in blanks on a flight that is unmistakably the same
one (same number, same day), provider readings of live status.

Staged for your yes: creating a new flight from a screenshot when none matches, claiming
whose flight it is, changing any fact that is already filled and disagrees, changing a
date, time, airport or flight number, and anything that writes to your calendar.

## H. Source priority

1. **You** — anything you confirmed or typed. Nothing overrides it silently.
2. **Provider reading** — for operational facts only (status, gate, terminal, times as
   flown, cancellation), always stamped with when it was read.
3. **Booking evidence** — the screenshot or the forwarded mail — for the plan itself
   (number, day, route, confirmation code, traveller).
4. **Echo's own inference** — last, and always labelled.

A lower source may fill a blank. It may never overwrite a higher one — it raises a
question instead.

## I. How we prove it with your screenshots

1. Send the Dulles → Taipei screenshot to Telegram with no caption. Expect: it is stored
   in the Inbox, read, recognised as a booking, and answered with `TG6285`, 19 Sep 2026,
   IAD → TPE, confirmation `AUZ7KL`, arriving the next day — plus one question about
   whose flight it is. Nothing bought, held or checked in.
2. Send it again. Expect: "already on record, nothing doubled", and no second draft.
3. File `TG6285` by number first, then send the screenshot. Expect: the blanks on the
   filed card fill in from the screenshot, with a receipt naming the screenshot.
4. Send a doctored version with a different time. Expect: nothing changes and one
   conflict question.
5. Ask in Ask and check Today and the flight desk: same flight, same provenance, one
   item, one acknowledgement.
6. Check the receipts room: a line for the capture, the read, each fill, and each
   provider reading.

## J. Outside our control

- The flight provider's plan blocks date-filtered lookups (a `403` we already handle by
  asking plainly and filtering locally), and a marketed codeshare number such as
  `TG6285` may return nothing at all — in which case Echo says the provider carries
  nothing rather than inventing a status.
- Provider data for a flight a day or more out is thin; gates and terminals usually
  appear only hours before departure.
- Reading a picture costs a model call, and 40 paid provider readings a day is the
  ceiling. The island flight the family is waiting on cannot be booked by Echo — no
  buying arm exists, by design.

## Recommended boundary

Build steps 1–4 and 6 first (screenshot → recognise → reconcile → evidence → one reply),
prove them with the real screenshots in Telegram, and only then extend the watcher to
claimed screenshot-born drafts and add the codeshare field. No new room, no new table,
no second notification path.
