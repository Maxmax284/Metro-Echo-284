# Work front page

Work briefs. It does not make the user choose from a menu.

## Model

`src/lib/workBriefing.ts` is pure. `src/hooks/useWorkBriefing.ts` supplies scope-filtered records; the lib decides what gets said.

```text
Where things stand
  Start here: 1 approval is waiting.      <- exactly one promoted tap
  Needs you    2   approvals / decisions waiting on a human
  Arrived      3   captures with no project attached
  Due          4   open commitments with a date, nearest first
  Drifting     1   projects untouched 10+ days and still open
Where work lands   Projects Inbox Commitments Actions Briefs Documents Schedule
Where Vanta looks  Memory Sherlock Awareness Cockpit
```

## Priority logic

No new scoring. The order of claim on attention is fixed:

1. approvals waiting (`actions.status in (proposed, staged)`)
2. overdue commitments
3. unsorted captures from the last 7 days
4. the nearest upcoming date
5. the quietest still-open project

`startHere()` returns the first that has records, or `null`. Never two. When every lane is empty the panel says so in one line instead of inventing content.

## Lane rules

- Two rows per lane; the true total is always shown, with "N more at the … desk".
- A lane with no records is not rendered.
- Due sorts by date, Drifting sorts quietest first.
- Tapping a row opens the desk or project that owns the record. Nothing executes from the briefing.

## Two shelves

Ten equal choices became two mental models. Every route, count and desk explanation ("?" peek) is unchanged — this is presentation only, no schema and no navigation model added. Cockpit stays on "Where Vanta looks" as an advanced dense view.
