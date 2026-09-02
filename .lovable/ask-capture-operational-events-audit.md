# Ask / Capture Log / Advisor audit — camp-state events

## What was wrong in the payload chain

1. **Fields were dropped at ingest.** `inbound.ts` read only guest, room and
   dates. `previous_state`, `total_price`, `payment_method`, `actor` and
   `reason` were present in `metadata.external_payload` but never lifted into
   the signal detail, so the capture text could not say what changed.
2. **Titles carried no identity.** Every state change rendered as
   "LMT Camp State booking state changed" — no booking reference, no before →
   after — so three different bookings looked like one repeated bubble.
3. **`needs_review` was hardcoded true.** Fully-formed, already-synced events
   asked for a human read they did not need, which trained the eye to ignore
   the flag.
4. **Advisor was fed the title, not the payload.** `CapturesView` passed
   `item.text` into Sherlock. Sherlock then correctly reported "missing
   information" about data that was sitting in the row.

## Backend fixes

- `_shared/awareness/inbound.ts`: `actorOf`, `reasonOf`, `paymentMethodOf`,
  `shortRef`, and `signalQuality`. Titles now include guest, room, status
  transition and a short booking reference; detail lines include actor and
  reason.
- `_shared/externalPlatform.ts`: writes `needs_review`, `confidence`,
  `disposition` and `missing_fields` from `signalQuality`. Review is asked for
  only when a required field is actually absent, and the missing field is named.
- No payload is discarded — `metadata.external_payload` is still stored whole.

## Frontend fixes

- `src/lib/campEvents.ts` hydrates a row into an `OperationalEvent`:
  headline, plain-English summary, fact lines, disposition and Bangkok-time
  stamp.
- `CaptureCard.tsx` renders those facts as a structured card instead of a text
  bubble.
- `CaptureEventGroup.tsx` + `groupCaptures()` collapse a run of identical
  events for one booking into a single row ("3 booking state changes"),
  carrying the strongest disposition. Expanding shows every capture with its
  normal actions.
- `CapturesView.tsx` sends the full operational brief to the advisor and to
  Recognize.

## Readability fixes

- `AmbientBackdrop` gained `.vanta-bd-scrim`: a flat contrast floor above the
  painted wall. Heavier in Ask (0.62, 0.72 on phones) and Receipts, lighter
  elsewhere, near-off when ambient is off. Artwork stays; text wins.
- Quick Ask sheet: opaque background, 82dvh, safe-bottom, 36px controls, and
  the situation chips are hidden on phones where they crowded the header.
- `ConversationDock`: bottom clearance raised to 68px over the nav, own
  top-fading scrim, stronger blur behind the composer.

## Doctrine held

Nothing in the Capture Log executes. Grouping is display-only; every row keeps
its own accept / edit / dismiss path and every route still writes a receipt.
