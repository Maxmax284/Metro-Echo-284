# Arrival pack and live airport board

## What will change

### 1. Arrival ground pack inside the existing flight card
- Add one compact arrival block for the destination airport.
- Show the destination currency and symbol from Echo’s kept country facts.
- Show two or three useful local phrases when they are on record.
- Show the most relevant airport-to-city transit shortcut from the kept travel notes, including its last-checked date.
- Show verified local emergency numbers and the travel-help number when available.
- If Echo has no verified phrase, transit, or emergency fact, say so briefly instead of filling the gap.
- Keep this secondary before takeoff, bring it forward in the air, and make it the lead ground information after landing.

### 2. Live airport board inside the same card
- Use the operating identity as the main board identity: **EVA Air BR3**.
- Keep **Thai Airways TG6285** as the smaller ticket alias.
- Show departure terminal, gate, and the airline/provider boarding state in one scan line.
- Update the board from the existing live flight reading; no second feed or duplicate state.
- Make the wording change with the journey phase:
  - Before check-in: operating airline, terminal/check-in direction, gate if filed.
  - At the airport: where to check in and what to search on the board.
  - Through security: gate and boarding watch take priority.
  - Boarding: gate and boarding status lead.
  - In air: arrival terminal/gate and progress lead.
  - Landed: arrival ground pack leads.
- If boarding is not explicitly filed, say **“Boarding time not filed”** rather than deriving a false live status.

### 3. Card cleanup
- Keep one obvious next move above the live board.
- Avoid repeating the same carrier, flight number, terminal, or gate elsewhere in the visible card.
- Keep the route map and detailed journey below the operational block.
- Preserve the existing live-check and remove-flight actions on the active flight.
- Do not restore manual “I’m on it / still at the airport” logging.

## Technical details
- Reuse `FlightLive`, `GroundLead`, `ArrivalStamp`, `arrivalFacts`, `countryFacts`, `countryNotes`, `localHelp`, and the existing journey phase.
- Add a pure arrival-pack helper and a compact card component; no new table or stored phase.
- Extend the current board presentation rather than introducing a new room, mode, dashboard, or notification path.
- All operational gate, terminal, status, delay, cancellation, and landing facts remain provider-owned.
- Currency, phrases, transit notes, and emergency numbers remain dated kept facts; no automatic AI or web lookup.

## Validation
- Test EVA Air BR3 / ticket TG6285 at IAD → TPE across pre-airport, terminal, security, boarding, in-air, and landed states.
- Test a flight with no codeshare, no gate, and partial arrival facts.
- Verify the card at 384px: one clear move, no duplicate labels, no overlap, regular AM/PM time.
- Verify reduced motion keeps every fact visible without flip or movement.
