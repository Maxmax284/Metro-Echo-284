# Physical loop — phone to receipt

Law: messaging feeds the system, it does not control it.

## Verified in code and data
- `telegram-webhook` writes notes, commitments and actions with status
  `staged`. No path in it executes an action.
- Every write is accompanied by an `audit_log` receipt carrying
  `source: "telegram"`.
- Owner account: `actions` executed count 0, so nothing has ever run without an
  in-app approval.
- Approval and execution live only in `actions-transition` / `actions-execute`,
  reached from the Actions desk inside Vanta.
- Scope: writes carry `organization_id`, and every read applies `applyScope`.

## One state change reachable from chat
The Telegram reminder buttons can mark a commitment done or snooze it one hour.
Both write receipts (`commitment.completed`, `reminder.snoozed`). This is a
promise acknowledgement, not an execution — but it is the only lifecycle change
reachable from a message. Flagged here for a decision rather than changed
silently.

## What still needs the owner's phone
The end-to-end loop can only be proven by sending real messages. Checklist:

1. Quick note -> lands in Inbox, source reads "From Telegram".
2. Commitment with a date -> appears in Commitments with the right timezone.
3. Prepared step -> appears in Actions as a draft, not executed.
4. Attachment -> lands as a file capture, readable.
5. Duplicate message -> one record, not two.
6. Malformed / empty input -> Vanta asks instead of guessing.
7. Missing or stale context -> Vanta says it cannot tell.
8. Wrong-scope attempt -> refused.
9. Approve on desktop after capturing on phone -> approval works, and does not
   carry implicitly across devices.
10. Interrupted approval / network failure -> no half-executed state.
11. Receipt appears after execution; undo shows only where rollback is real.
12. Quiet hours respected.

Validate the Inbox, Actions and Receipts rooms at 384px while doing it.
