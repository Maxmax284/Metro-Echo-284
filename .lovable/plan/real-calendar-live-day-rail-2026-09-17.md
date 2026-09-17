# Real calendar → live day rail

## Current truth
- Google Calendar is already connected to this account through the existing per-user connection.
- The existing calendar job is healthy and imports the next 30 days every five minutes.
- It already deduplicates entries, records added/moved/cancelled changes, preserves project filing, and writes sync receipts.
- The day rail reads those imported entries correctly, but it holds a one-time page snapshot. A calendar change can reach Metro Echo without the open rail repainting.

## Build
1. **Keep the existing calendar engine**
   - Reuse the current Google import, five-minute schedule, change detection, scope rules, and receipts.
   - Do not create another calendar table, sync worker, or scheduling system.

2. **Make the agenda data reactive**
   - Subscribe the shared agenda data hook to calendar-entry inserts, updates, and removals.
   - Filter every incoming change through the active Personal / Workspace scope before refreshing.
   - Debounce clustered changes from one sync pass so a large import causes one repaint, not a request storm.
   - Clean up the subscription and pending refresh when the person leaves the page or changes scope.

3. **Refresh the exact rail being viewed**
   - Wire the existing open-calendar check to the Agenda Board's own data instance.
   - After the import completes, refresh that same board so its list and animated strip update together.
   - Preserve the selected day and horizontal rail position while data changes.

4. **Keep the behavior honest**
   - External calendar edits remain read-only imports; they require no approval because Echo is only observing.
   - Any future write back to Google still follows Prepare → Approve → Execute → Receipt.
   - Removed events disappear, moved events move, and unchanged events stay quiet.

## Verification
- Tests for insert, move, cancellation, active-scope filtering, burst debouncing, and subscription cleanup.
- Confirm the current Google feed still imports without duplicate agenda items.
- Change a real Google Calendar event, run/observe the sync, and verify the open mobile day rail updates without reloading.
- Recheck at 384px so the animated rail remains clean and scrollable.

## Not building
- No second calendar room or tools menu.
- No new calendar provider or duplicate sync engine.
- No silent calendar writes.
- No fake instant push claim: Google is polled every five minutes; once a change lands, the open rail updates immediately.
