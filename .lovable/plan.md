# Telegram calendar panel and Dani repair

## What I found

- Google is connected and syncing normally. Metro Echo currently holds the same two real events from Google: the Wingate stay and ADHD appointment.
- The Dani event never reached Google or Metro Echo’s calendar. One malformed proposal is approved but unwritten; another is still staged. Neither has a provider event ID.
- The first proposal stored a human time instead of a provider-safe timestamp and treated requested reminders as removals. Current normalization protects new writes, but that old approved draft is also missing a title, so retrying it cannot safely create the event.
- The second attempt lost its details across follow-up messages. Echo asked for time, then title, but did not retain the earlier Dani/location/reminder context.
- Telegram already has `/day`, `/week`, `/queue`, shared approvals, Google execution, local projection, and receipt logging. The smallest fix should extend these paths, not create another calendar engine.

## Build

### 1. Upcoming calendar panel in Telegram

- Make `/calendar` open one compact panel containing upcoming Google events, Metro Echo reminders, and pending calendar edits.
- Give each real event an `Edit` button and each reminder an appropriate manage control.
- Keep `/day`, `/week`, and `/queue` as direct shortcuts, while making `/calendar` the obvious front door.
- Refresh the same Telegram panel after edits when possible instead of stacking duplicate messages.

### 2. Tap-to-edit flow

- `Edit` selects the exact calendar event by its stored calendar row, then asks what should change.
- The next reply refines a single staged proposal with exact before/after values, versioned approval buttons, and `Stop it`.
- Approval stays inside Telegram and uses the existing shared Google executor, risk checks, projection into Today/Schedule, audit events, and Receipts.
- Ambiguous changes ask one focused question; they never guess or write silently.

### 3. Keep multi-message calendar context

- Persist a short-lived Telegram calendar draft context so title, date/time, place, and reminder offsets survive follow-up answers.
- Merge each answer into the same draft; do not create duplicate actions.
- Only stage once a new event has a valid title and provider-safe time. Location and reminders remain attached.
- Clear the draft when staged, stopped, expired, or successfully written.

### 4. Repair the Dani dead end safely

- Retire the two malformed, unwritten Dani proposals without deleting their history.
- Create one corrected staged proposal from the facts already supplied: `Evening Meetup with Dani`, September 15 at 6:00 PM America/New_York, location `One Loudoun or Old Town`, reminders one day and one hour before.
- Send the corrected proposal back to Telegram for an explicit Yes/No. Do not write it to Google until that approval.
- After approval, verify the Google event exists, Metro Echo’s calendar row is projected/synced, Telegram `/calendar` shows it, and a receipt exists.

## Technical details

- Reuse `calendarAgenda`, `calendarProposal`, `calendarSettle`, `calendarExecute`, and the existing action lifecycle.
- Add compact panel rendering and callback IDs backed by owned database row IDs; never trust callback payloads without user ownership checks.
- Store conversational draft state in the existing Telegram/message or action infrastructure if it can represent the state cleanly; add no parallel action or notification system.
- Keep Google as durable event truth and Metro Echo as interpretation/context.

## Verification

- Tests for panel rendering, event/reminder buttons, ownership, one/many/none event resolution, multi-turn field retention, draft expiry, duplicate prevention, version retirement, approval, stop, Google failure, and local projection.
- Run typecheck and the full test suite.
- Deploy the Telegram function, then perform a real Dani approval/write/sync check without creating duplicate events.
