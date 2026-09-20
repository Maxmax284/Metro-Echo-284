# Post-trip audit: IAD → TPE → BKK, and what Metro Echo should do next

Read-only. Nothing was changed, nothing published. Your Bangkok arrival is on record as your word; no onward USM flight has been inferred or created.

## What the trip actually proved

**Verified in the database right now**
- BR3 / TG6285 (IAD→TPE): landed, source `you`.
- TG637 (TPE→BKK): landed, source `you`, with your paper-ticket 07:15 stamped as *boarding* (not departure), note "boarding 07:15 off your ticket, departure not filed".
- Two dropped TG637 duplicates and four dropped TG601 proposals remain as history — collapsed in display, not deleted. Correct behavior.
- Bangkok place is hand-set (`user_words`), Chantilly archived not erased.

**Held up in the real world**
- The long-haul countdown fix. The 16h-vs-4h11m blowout was provider wall-clock parsed in the device's timezone; airport anchoring fixed it and the number stayed honest through the IDL for the rest of the flight.
- Traveler word vs provider word per leg. Your stale Dulles "boarding" tap got labelled older-than-the-feed instead of being erased or believed.
- TG637 chained on your ticket time without a filed departure, and correctly gave you no minutes-to-landing rather than a fake one.
- Refresh no longer blacks the card out.

**Verified as code + tests only, not by real use**
- Transfer verification capture (gate/boarding/baggage from a board or desk). Built, tested, shipped — you never actually typed a board reading into it in Taipei. Unproven in the field.
- Route map / globe views. Rendering tested, not stress-tested on airport Wi-Fi.
- Offline cabin-ETA calibration. Never exercised, because TG637 had no filed arrival to compare against.

**Production vs preview:** everything above is published at metroecho.lovable.app. No pending preview-only work.

## The real gap: entry-document readiness came too late

Right now the TDAC guidance lives in the "At the border" card on the **landed** leg. That means Echo told you about a card you're supposed to file **up to 3 days before arrival** at the moment you were standing in the immigration hall. Technically correct, operationally useless.

Confirmed correct in the current rules (`src/lib/entryReadiness.ts`):
- TDAC only for non-Thai nationals actually entering; airside-only transit → no card owed.
- BKK→USM domestic → no card, no second TDAC. A domestic hop is not a new entry.
- Official free domain, the paid-imitation warning, "this is not a visa", sources with a checked date.
- Any country without a vetted guide → "check the official immigration site", never invented rules.
- Only country of passport is asked. No passport number stored. Echo fills in and submits nothing.

Nothing in the rules implies other countries or airside transits need the same thing. That stays.

## Prioritized minimal next fixes

**1. Move entry readiness earlier in the journey (the real fix)**
Surface the same card on the *upcoming* leg whose arrival airport is in a guided country, from ~3 days out, not only after landing. Same rules, same source labels, same "I've filed it" acknowledgment — just a different trigger. This is a trigger change, not a new system.

**2. Source-freshness honesty on the guide**
`checkedOn` is a hand-typed date. Add a staleness line ("checked 20 Sep 2026 — verify on the official page if it's been a while") once the date is more than ~90 days old, and keep the official link the primary action rather than Echo's paraphrase.

**3. Same-trip reuse, stated plainly**
Once you acknowledge TDAC for an entry, later legs inside that country say "already filed for this entry — a domestic hop is not a new entry" instead of going quiet. Prevents the re-ask that would make you distrust it.

**4. Gmail: stop showing a dead switch as a live one**
Verified today: the sweep runs and fails honestly — `mail_sync_state.last_error` says Google has the service switched off. Gmail and Drive APIs are still blocked in the Google Cloud project behind your sign-in (604846252906). Only you can flip them:
- https://console.cloud.google.com/apis/library/gmail.googleapis.com
- https://console.cloud.google.com/apis/library/drive.googleapis.com

Once enabled, flags clear on the next settings load — no reconnect. Until then, Settings → Your inbox should read "blocked by Google, here's the one thing to click" instead of a switch that looks armed. Discovery is background-capable but has never delivered a single real mail proposal. Also still true: PDF boarding passes aren't parsed.

**5. Prove the transfer capture on the next connection**
Not new code — a field test. Next connection, type a real departures-board gate into the capture box and confirm it outranks the provider and lands a receipt.

## Not doing

No new arrival-card systems, no form submission, no country rules without a vetted official source, no onward USM flight invented, no destructive cleanup of the dropped-proposal history.

## Technical notes

Trigger change in `FlightDesk.tsx` (currently gated on `landedHere && livePlan`) plus a new `entryRead` kind for an upcoming-arrival leg in `src/lib/entryReadiness.ts`. Reuse acknowledgment pattern (`echo.entry.ack.<planId>` + guide fingerprint) keyed by entry rather than plan so a later domestic leg sees it. Staleness derived from `checkedOn`, no network call. Regression tests: upcoming-leg trigger inside/outside the 3-day window, transit still silent, domestic still silent, acknowledgment carried across legs of one entry, stale checked-date wording.
