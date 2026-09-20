# Arrival filings: honest states, not a Yes/No

Your Bangkok arrival exposed one real gap, not seven. Echo currently treats an arrival
declaration as a switch: filed or not filed. Your actual outcome was none of those — the
official form refused the accommodation fields, accepted the submission anyway, and a human
officer closed the gap at the counter. That is a normal outcome and Echo has no word for it.

Everything below reuses the border card, the source labels and Receipts you already have.
No new room, no new system, no paperwork, no address ever stored.

## What already exists (verified in code)

- `src/lib/entryReadiness.ts` — vetted Thailand/Taiwan/Singapore guides, filing windows,
  staleness, `ENTRY_FIXES` troubleshooter, `already_filed` for a domestic hop.
- `src/components/schedule/EntryReadiness.tsx` — the card, the "marked done by you, not
  verified with {country}" wording, per-entry acknowledgment.
- `src/lib/transferVerification.ts` — the provenance pattern for a fact you verified locally
  versus one a provider reported, with conflict handling.
- `audit_log` + Receipts — already carries traveler-word events such as
  `flight.landed_reported_by_person`.

So lessons 1, 2 and 5 are half-built already. The materially missing parts are 3, 4, 6, 7.

## The change: five small things

1. **Filing state replaces the switch.** Instead of "I've filed it", the card offers:
   not started · the form blocked me · submitted, accepted by the website · an officer sorted
   it at the counter. Each is your word, labelled as such. "Submitted" never reads as
   approved — the card keeps saying acceptance by a website is not admission, and officers
   have the final say.

2. **Known-before is not confirmed-now.** The prep list gains one line: information already
   on record with immigration from a previous filing is not the same as a current declaration
   on this form. Have your current address readable on your phone. Echo does not ask for it,
   store it, or upload anything.

3. **A residence line for people who live there.** One optional choice — visiting, or living
   here on a lease. If you live there, the prep copy says "your own address, as on your
   tenancy" instead of hotel wording. No document, no lease, no landlord details, no upload.

4. **Blocked-by-the-form gets real steps.** `ENTRY_FIXES` gains the case you actually hit:
   greyed-out required fields, submitted anyway, missing information flagged at the desk —
   screenshot it, keep the confirmation, say it plainly at the counter, ask for assistance.
   Echo does not guess why a government website disabled a field.

5. **Contradictions surface instead of resolving themselves.** If two answers end up on
   record for one entry (blocked, then submitted, then an officer), the card shows both with
   their times rather than picking a winner — the same shape as the "older than the feed"
   handling on flight legs.

## Receipts

Each state change writes one receipt, plain English, your word attributed to you:
"You said the Thailand form blocked the accommodation fields" and later "You said an officer
resolved it at the counter." Nothing in Receipts claims a government record exists.

## Technical notes

- Extend `EntryRead` / card state with a small `FilingState` union in `entryReadiness.ts`;
  keep the existing per-entry key (`echo.entry.ack.c.<cc>`) and read legacy values as
  "submitted" so nothing you already marked is lost. Device-local, offline.
- New audit events `entry.filing_state_said_by_person` with `{ country_code, state, at }`
  only — no address, no identifiers.
- Residence posture stored as one enum in existing user preferences, not a new table.
- Contradiction detection is a pure helper over the recorded states; no migration.
- Tests: each filing state's copy, submitted-not-approved wording, blocked-vs-not-started,
  officer-resolved, contradictory pair rendering, residence wording, domestic hop still
  silent, no address or document field anywhere in the component tree.

## Not doing

Seven new systems. Any storage of address, lease, licence or passport data. Any claim that a
prior filing satisfies a fresh declaration. Any push channel we do not actually deliver on —
these cues stay in-app. Any change to the in-flight implementation work already queued.
