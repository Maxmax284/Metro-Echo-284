## Maturity scorecard (excluding Google Calendar + Sherlock)

Honest read of where each pillar sits today, 0–10. "Mature" means doctrine-aligned, mobile-clean, audit-emitting, and useful daily.

| Surface / System         | Score | State |
|---|---|---|
| Capture (notes, files, email, Telegram inbound) | 8.5 | Solid. Multi-channel in, audit + autolink working. |
| Memory (notes/files/links/captures) | 8 | Real. Re-classify + audit deep-links shipped. Search good. |
| Commitments (open/done/cancel + reminders) | 7 | Works, but resolve UX is weak on overdue (see below). |
| Schedule / Today | 7.5 | Newly mounted, chips + briefing live. Missing inline resolve. |
| Daily Briefing | 7 | Deterministic counts solid, AI polish opt-in. Could use "what to do next". |
| Companion (intent handler, chips) | 7.5 | Queries route cleanly; tz stamping correct. |
| Audit log + Aftermath timelines | 8 | Receipts everywhere. Filter polish done. |
| Awareness (place, freshness, briefings) | 7 | Strong skeleton, real data flowing. |
| Actions (staged → executed, rollback) | 7 | Plan→Approve→Execute holds. Executors wired. |
| Telegram (inbound + outbound reminders) | 7.5 | Capture + delivery + quiet hours + status strip. Staged push next. |
| Push / PWA readiness | 4 | Staged only. No service worker, no delivery yet. By design. |
| Settings / Control Room | 7 | Real toggles, owner-gated, mode badge. |
| Mobile shell (384px) | 7.5 | Today mounted, bubble repositioned, rail+bottom nav. |
| Auth + RLS + roles | 9 | Clean separation, no leaks. |

**Weighted average across shipped pillars: ~7.4 / 10** — past prototype, into "real daily-use beta." The gap to 9 is delivery (push), polish on resolve flows, and a couple of mobile density passes.

---

## Bug you flagged: overdue commitments have no resolve action

Two places show commitments. Only one has a complete button:

- **CommitmentsSurface** — has a `CheckCircle2` tap target (line 206) wired to `complete()`. Works, but the icon is small (h-4 w-4) and easy to miss at 384px, and there's no Snooze or Dismiss.
- **ScheduleSurface → CommitmentRow** (line 200–217) — read-only. No way to mark done, snooze, or dismiss directly from Today's Overdue / Due Today / Upcoming lists. This is the row you were tapping.

## Plan

### 1. Add inline resolve actions to ScheduleSurface CommitmentRow
On each row in Overdue / Due Today / Upcoming, add a compact right-aligned action cluster:
- **Done** (CheckCircle2) → `status = 'done'`, audit `commitment.completed` (or `reminder.completed` if reminder).
- **Snooze** (Clock) → opens a tiny popover with `+1h`, `Tonight`, `Tomorrow 9am`. Updates `remind_at` (and `due_at` if overdue and user picks Tomorrow). Audit `commitment.snoozed` with `{from, to}`.
- **Dismiss** (X) → `status = 'cancelled'`, audit `commitment.cancelled`.

Tap targets ≥ 32px. Confirm via toast using `vantaSay`. Optimistic update + revert on error.

### 2. Strengthen CommitmentsSurface resolve UX
- Promote the small CheckCircle2 to a 32px tap target with label-on-hover.
- Add the same Snooze + Dismiss controls so both surfaces match.
- Add a "Resolved today" collapsible footer so the user can undo a mistaken complete (status flip back to `open`, audit `commitment.reopened`).

### 3. Shared component
Extract a `CommitmentActions` component used by both surfaces so behavior, audit events, and tap sizes stay in sync.

### 4. Audit + briefing carry-through
- Every state change emits `audit_log` with `entity_type='commitment'`, `event` in `{completed, snoozed, cancelled, reopened}`, payload includes prior/next values + tz-stamped `at`.
- DailyBriefingCard already reads counts — confirm it decrements when items resolve (it does, via re-query; verify after).

### 5. 384px walkthrough
Verify on the active viewport (384×671):
- Action cluster doesn't push the summary into truncation.
- Snooze popover fits within viewport, doesn't clip.
- Overdue red ring + warn text still readable with new icons.

### Out of scope
- No Google Calendar.
- No new push pipeline.
- No Sherlock changes.
- No schema migrations (all status/audit columns exist).

### Files touched
- `src/components/surfaces/ScheduleSurface.tsx` (CommitmentRow → action cluster)
- `src/components/surfaces/CommitmentsSurface.tsx` (bigger tap targets, snooze/dismiss, resolved-today footer)
- `src/components/commitments/CommitmentActions.tsx` (new, shared)
