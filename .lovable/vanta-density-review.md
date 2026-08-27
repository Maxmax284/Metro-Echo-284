# Cockpit / density review

Audit only. Nothing was removed in this pass.

## What Cockpit is today

Five panels under `src/components/cockpit/`:

| Panel | Behavior |
| --- | --- |
| `DailyBulletinCard` | Composed daily bulletin from `briefing-compose`, dismiss / mark-all-seen / undo lifecycle |
| `DailyChecklistCard` | Derived checklist for the day, driven off commitments and staged actions |
| `ProductivityPulseCard` | `useProductivityPulse` — recorded-activity trend, sparkline read over time |
| `ProjectRollupCards` | Cross-project rollup: open items, approvals, quiet projects |
| `OperationsBriefingPanel` | Grounded operations read with an `AftermathFooter` hand-off |

## Unique value

- **Cross-object rollups.** Project rollups and the operations briefing relate several object types at once. No other surface does that; Work lists desks, Today lists what is urgent.
- **Trend over time.** The productivity pulse is the only place recorded activity is read as a trend rather than a list.
- **Composed narrative.** The daily bulletin is a produced artifact with its own lifecycle, not a rendering of rows.

## Duplicated value

- The daily checklist substantially overlaps Today's "Needs attention" and "What's next".
- Project rollup counts repeat the counts Work already shows on its desks.
- The bulletin overlaps `LiveBulletin` on Today for the "what just happened" read.

## Recommendation

**Keep Cockpit as an advanced deeper tool.** It is not merely a denser Work: the rollups, the trend, and the composed bulletin are relationships nothing else expresses. Removing it would delete information, not just density.

Two follow-ups, both deferred:

1. **Retire the daily checklist panel** into Today's existing sections. It is the one panel that is pure duplication.
2. **Progressive density instead of two mental models.** If Vanta later wants Comfortable / Compact / Dense, it should be one surface with a density setting rather than a normal view plus a power-user room. The primitives already exist — `--feel-k` for motion scaling and the collapsible panel system for information scaling — so a density option would be a token pass, not a new system. Do not build a second density system.

## Anti-goal

Vanta must not read as a simplified interface with all the serious information hidden in Cockpit. The clarity work in this pass (meta lines, aftermath, provenance, freshness) applies to the normal rooms first, precisely so Cockpit stays optional.
