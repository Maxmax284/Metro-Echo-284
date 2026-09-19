# Metro Echo — from "can read your mail" to "actually watches it"

## What the code says today (verified, not vibes)

**The recognizer is real.** `flightRecognize.ts` + `flightNotice.ts`: deterministic
pattern read, evidence lines, ownership question with four answers, sender memory,
dedupe per flight, conflict and condition capture. Covered by tests.

**It is fed by exactly three mouths** (`rg noticeFlights`):
- `email-inbound` — your forwarding address (1 address on record)
- `telegram-webhook` — a message you forward
- `flight-notice` — text you paste into the desk

**Gmail is not one of them.** `gmail-read` is called on demand only (Work mail
shelf on mount, Ask `search_mail`, Sherlock investigate). No cron touches Gmail —
the live jobs are journey-watch (10m), drift sweep (hourly), calendar-sync (5m),
bridge-dispatch (5m), sherlock watch/patterns/digest, decay, physical/wearable
sweeps. So "Echo found a flight in your email" does not happen today.

**The answer flow is real but quiet.** `flight_noticed` is a raw `nudges` insert —
it never goes through the awareness evaluator, and the kind is missing from
`DRIFT_KINDS`, so Today's noticed row cannot show it. It appears only in the
flight desk block and the generic nudges panel. In-app, app-open, no push, no
Telegram. Push/Telegram delivery exists, but only for signals the hourly sweep
produces.

## Where to go next (integration, not new toys)

### 1. A real mail sweep (the missing 20% that unlocks everything)
New `gmail-sweep` edge function + hourly cron, per user with a live
`google_mail` connection:
- Track `historyId` per user (new `mail_sync_state` row); first run = bounded
  backfill by query (`newer_than:14d`), then `history.list` deltas.
- Candidate filter only — booking/confirmation/itinerary/receipt-shaped mail, not
  the whole mailbox. Headers first; body fetched only for candidates.
- Batch requests (`/batch/gmail/v1`, ≤50 parts) instead of the current
  one-fetch-per-message loop.
- Dedupe on Gmail message id in a `mail_seen` table, so a resend is silent.
- Feed the existing `noticeFlights` + entity-link + embedding path already proven
  by `email-inbound`. No second brain.

### 2. Make the question reach the person
- Add `flight_noticed` (and a new `mail_noticed`) to `DRIFT_KINDS` so it lands in
  Today's noticed row.
- Route it through the awareness evaluator instead of a raw insert, so urgency,
  quiet hours, attention budget, push and Telegram all apply with existing
  consent gates. A booking 6 hours out earns the phone; one 3 months out does not.
- Telegram answer buttons reuse `attentionButtons` — answering from Telegram
  records the answer, it never confirms a flight. Capture still never executes.

### 3. Widen recognition past flights, same frame
Reuse the ownership/evidence/dedupe shape for: hotel and rail bookings, parcel
tracking, bills with a due date, appointment confirmations. Each becomes a draft
with evidence and one question — never a calendar write, never a promise, until
answered.

### 4. Close the receipt loop
Every recognition, question, answer and dismissal already writes `audit_log`;
Receipts should show the mail-origin chain end to end ("this flight came from a
mail from EVA on 12 Sep, you said Mine, you confirmed it 3 minutes later").

### 5. Cost and privacy guardrails to write down before shipping
- Per-user daily Gmail read ceiling in `api_usage_logs`, same pattern as the
  flight feeds (and remember: receipts must be written with the service-role
  client — the user client's inserts are dropped by RLS).
- Sweep is opt-in per service in Settings, off by default, with a plain line
  saying what it reads and what it never does.
- Bodies are read for candidates only and not stored verbatim beyond the note
  the person can see and delete.

## Suggested order
1 → 2 first (that is the whole "Hey, is this flight yours?" experience going
live), then 4, then 3, with 5 written alongside 1.
