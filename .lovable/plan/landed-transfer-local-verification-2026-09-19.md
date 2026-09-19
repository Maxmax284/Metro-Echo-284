# Landed-transfer local verification

## What will change
- Add a compact connection next-steps panel when a traveler has landed and an onward flight is confirmed or proposed.
- Keep uncertain ground facts explicit: official airport boards and airline staff lead when gates, boarding, baggage-through status, or transfer steps are missing or conflict.
- Add an accessible review-first form for locally learned gate, boarding time, baggage status, and transfer/entry status. Nothing changes until reviewed and confirmed.
- Store traveler-verified facts within the existing flight record metadata, with source and timestamp, and emit existing audit receipts; no new table or migration.
- Show concise provenance per relevant fact: provider-reported, traveler-reported, locally verified, missing, or conflicting.
- Let the traveler acknowledge unchanged guidance once on the device; re-show it when consequential connection facts change.
- Keep candidate versus confirmed semantics intact. Local verification never books, boards, confirms ownership, or adds a proposal to the active journey.

## Safety boundaries
- Do not alter the recorded BR3 arrival, TG637 booking/boarding state, departure time, or any live journey data during implementation or testing.
- Do not invent a desk, gate, baggage instruction, immigration requirement, or aircraft position.
- Preserve countdown/timezone selection, stable refresh, provider/codeshare behavior, offline cache, route Map/Globe/Sketch, Today, Receipts, and delivery channels.
- Keep guidance contextual to the transfer card; no app-wide warning and no new notification channel.

## Technical notes
- Extend existing flight-plan metadata types and the flight-plan hook with reviewed local-fact updates and audit events.
- Add a focused transfer-guidance component and pure helper for source labels, checklist state, conflicts, and acknowledgment keys.
- Integrate through the existing arrival/connection presentation and candidate card paths without changing journey derivation.

## Verification
- Add fixtures for landed + candidate, landed + confirmed, unknown departure, gate conflict, baggage through/unknown, entry versus transit, offline mode, and acknowledgment resurfacing.
- Run focused flight, journey, Today, Receipts, timezone, telemetry, and route-map tests, then the full suite, typecheck, and production build.
- Verify the landed transfer flow at 384px. Publish only after all checks pass.
