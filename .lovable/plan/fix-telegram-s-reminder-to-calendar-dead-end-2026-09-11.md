# Fix Telegram’s reminder-to-calendar dead end

## What is actually broken
- The private reminder exists, but no calendar action was ever staged, approved, or sent to Google.
- The follow-up “put it on my calendar” was treated as an edit to an existing calendar event. Because no event existed yet, Echo stopped at “nothing matches” instead of proposing a new event.
- “Remove that reminder” had no supported reminder-cancel action, so the model incorrectly claimed reminders cannot be removed.
- Clear follow-ups can still produce prose without calling a tool, which lets the conversation bypass the action spine entirely.

## Build
1. **Make creation explicit**
   - When a proposed calendar change includes “create/existence” details and no calendar row matches, treat it as a new-event proposal rather than a failed edit.
   - Preserve the title, time, place, and requested reminder offsets from the conversation.

2. **Add real reminder cancellation**
   - Add one shared reminder-cancel path for Telegram and Ask.
   - Resolve the user’s recent matching private reminder, handle one/many/none honestly, mark the selected reminder cancelled, and write the audit receipt.
   - “Start over” cancels only the private reminder; it does not silently create or alter a Google event.

3. **Deterministic rescue for obvious follow-ups**
   - Before free-form model prose, recognize clear phrases such as “put this on my calendar” and “remove that reminder.”
   - Use recent Telegram thread context and owned records to call the same shared staging/cancellation paths.
   - Never let an existing private reminder block a calendar-create proposal.

4. **Keep approval and Google writing unchanged**
   - Calendar creation still shows the exact proposal with Yes/No.
   - Only Yes advances through the existing action executor to Google and records a receipt.
   - No silent external writes and no second calendar engine.

## Proof
- Regression tests for: no-match creation, reminder-to-calendar follow-up, reminder cancellation, one/many/none reminder resolution, duplicate prevention, and “start over” not creating an event.
- Deploy the Telegram and Ask functions that changed.
- Run type checks and the full test suite.
- Recheck the real records to confirm the stale private reminder is cancelled and no phantom Google event is claimed.
