# Fix Telegram calendar confusion and recover the Villas request

## Confirmed problem

- The September 22 Villas event does **not** exist in Metro Echo’s synced calendar, and no Villas calendar action was created.
- Echo misread the phrase “reminder on my calendar” as “put my most recent private reminder on Google Calendar.” It selected the old storage-unit reminder and returned that old Google receipt.
- The actual Villas request remained as an incomplete Telegram draft. Its date was stored in the wrong field, so follow-ups kept asking for a day and time that had already been supplied.
- The stale conversation receipt pointer then made a new request sound like a status question about the unrelated storage-unit event.

## Build

1. **Separate new event requests from reminder promotion**
   - Treat a self-contained request containing a title/place, date, time, and reminder offsets as a new calendar event.
   - Only promote an existing private reminder when the wording explicitly refers back to it, such as “put that reminder on my calendar.”
   - Never select the newest reminder merely because a new request contains the words “reminder” and “calendar.”

2. **Make the common booking path deterministic**
   - Parse the event title, date, clock time, location, and multiple reminder offsets before the language model can choose an unrelated record.
   - For the reported request, produce one proposal for **Appointment at the Villas**, Tuesday September 22, 2026 at 1:00 PM in the user’s stored timezone, with reminders 24 hours and 1 hour before.
   - Show the exact proposal with Yes/No in Telegram; do not write to Google until Yes.

3. **Harden conversation state**
   - A complete new calendar request supersedes an incomplete draft instead of inheriting or merging unrelated fields.
   - Scope the “last calendar action” pointer to the current request. New actionable details cannot be answered from an older receipt.
   - Clear expired or malformed drafts automatically.
   - Add a Telegram reset command for the current calendar draft only. It will not erase messages, receipts, calendar events, or unrelated reminders.

4. **Repair the current chat safely**
   - Remove the orphaned Villas draft and stale action pointer from Telegram’s working state only.
   - Do **not** delete the old storage-unit event or any other real calendar entry.
   - Re-stage the already-sent Villas request as a fresh proposal in the linked Telegram chat so it is ready for the user’s approval.

5. **Keep replies grounded**
   - “Google confirmed” may only refer to the exact proposal tied to the current Telegram message and a matching provider receipt.
   - If the requested event is absent, Echo says it is absent; it cannot substitute another event’s receipt.
   - After approval, return the exact event title, local date/time, reminder offsets, and saved receipt.

## Verification

- Regression-test the exact screenshot sentence and the follow-up sequence shown in the thread.
- Test that an unrelated recent reminder can never win over a fully described new event.
- Test new request, refinement, typed Yes/No, button approval, cancellation, stale draft expiry, and reset behavior.
- Deploy the Telegram handler and run the focused and full test suites.
- Confirm the recovered proposal appears in Telegram, then after user approval verify the matching Google receipt and September 22 day-rail entry.

## Safety boundary

- No existing calendar item will be deleted because there is no Villas item on September 22 to remove.
- Reset affects conversational working state only; the audit trail remains intact.
- Calendar execution still requires approval from the exact linked Telegram chat and proposal message.
