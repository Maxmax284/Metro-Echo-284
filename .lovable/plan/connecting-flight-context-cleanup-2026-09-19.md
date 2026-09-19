# Connecting-flight context cleanup

## What will change
- Keep the active BR3 journey untouched while making TG637’s proposed state explicit: ownership, adding to the journey, and physical arrival remain separate actions.
- Replace vague missing-time language with “Possible connection — departure time needed” and explain that duration versus overnight is unknown until departure is recorded.
- Contextualize airport-stage actions to the flight’s origin, and suppress impossible arrival confirmations while the active journey is still in the air.
- Replace unconditional baggage-claim guidance with a neutral arrival/transfer choice when onward travel or checked-through baggage is not confirmed. Proven connections retain transfer guidance; final arrivals retain entry guidance.
- Make source copy match the actual record: flight-number-only, pasted, recognized email/message, or manually timed.
- Collapse settled proposals behind an accessible history control and safely group exact display duplicates without deleting any records or receipts.
- Align candidate wording with Flights, Today, and the journey spine using shared derived labels only; no live-reading, ETA, notification, or persistence changes.

## Technical notes
- Limit edits to existing flight presentation and pure journey-fit/source-copy helpers.
- Add fixtures for in-air BR3 plus untimed TG637, confirmed onward travel with unknown baggage, and multiple dropped proposals.
- Preserve the shared timezone/countdown path, stable refresh behavior, provider fallback, user overrides, offline state, gate retention, and all backend records.

## Verification
- Run focused journey-fit, connection, flight-plan, terminal-path, telemetry, countdown, and new UI tests.
- Run the full automated suite and TypeScript check through the project harness.
- Verify the flight desk at 384px before publishing, then publish only after checks pass.
