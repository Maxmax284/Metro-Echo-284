# Audit: why Google reminded you and Echo stayed quiet

Forensic only. No code, data, migrations or deploys touched. The Gmail/Drive per-user connector work is still the next thing after this — see the last section.

## 1. What happened

The event is in Echo. Twice.

Live records for your account, "ADHD appointment":
- Runs `2026-09-14 20:00Z` to `21:00Z` — that is 4–5 PM Eastern tomorrow. Exactly what your phone said.
- Google UID `6gqjcc9o…@google.com`, synced clean at `23:00Z` tonight, no sync error.
- Stored twice, once per feed, because you have two feeds pointed at the same Google calendar:
  - `Google Calendar` (provider `google`, added Sep 10 18:56)
  - `Echo` (provider `ical`, the private .ics link for the same Gmail address, added Sep 10 11:42)
- Both feeds report 5 events, both last synced at the same minute.

So: ingestion is fine. Nothing was missed, dropped, or mistimed. Timezone is correct.

What Echo does **not** store: Google's own reminder settings. The sync reads title, place, start, end, all-day and UID. That's it. Google's notification on your phone came straight from Google to your phone and has zero connection to anything in Echo — separate pipe, separate decision, separate clock.

## 2. Why nothing came from Echo or Telegram

Three separate reasons, each on its own enough.

**a) There is no next-day calendar reminder in the product at all.**
The calendar sense only produces two signals: something starts soon, and a promise landing inside a booked block. "Soon" is hard-coded at **45 minutes** (`SOON_MINUTES` in `_shared/awareness/adapters-calendar.ts`). An appointment 21 hours out produces no signal, by design. A T-24h heads-up for a plain appointment was never built.

**b) Proactive awareness is switched off on your account.**
The hourly sweep (`awareness-drift-sweep`, cron `0 * * * *`) filters to profiles where `proactive_awareness_enabled === true`. Your preferences blob contains only `context` — no awareness flag, no push flag, no Telegram awareness flag, no quiet-hours values. So the sweep skips you entirely before it ever reads your calendar.

**c) Even if it had run, nothing could have reached you.**
- Push: needs `push_reminders_enabled` on. Not set. (You do have 1 registered device, so the device isn't the problem — the switch is.)
- Telegram: needs `telegram_awareness_enabled` on. Not set. (Your chat is linked, so again — the switch, not the wiring.)
- Default quiet hours are 22:00–07:00 local, and 6:57 AM falls inside that window. Under today's defaults, that hour is silent anyway.

**One more thing worth flagging:** the T-24h reminder that *does* exist (`commitment-reminders`, hourly) only looks at **commitments** — promises you made — not calendar events. Your three open commitments are the storage unit, the visa copy, and Dani. There is no ADHD commitment row. So even that job had nothing to fire on, and it's also gated behind `telegram_reminders_enabled` / `push_reminders_enabled`, both unset.

## 3. Verdict on classification

Not a bug. Two things stacked:

- **Missing product behavior** — no next-day calendar reminder exists. That's the real gap.
- **Configuration** — every proactive channel you own is switched off, so today's rules were guaranteed silence regardless.

Should Telegram have fired under today's rules? **No.** Correctly, not sadly. Telegram only carries proactive awareness when the switch is on, the ladder asks for reach, and it's outside quiet hours. None of those held.

## 4. Code and jobs involved

- `calendar-sync` — cron `*/5 * * * *`, ran fine, ingested the event twice (two feeds).
- `_shared/awareness/adapters-calendar.ts` — 45-minute horizon, the reason no signal exists.
- `awareness-drift-sweep` — hourly, opt-in gate, quiet-hours gate, push/messaging gates, Telegram send path.
- `ambient-pulse` — same calendar signals, but only on app open, not scheduled.
- `commitment-reminders` — hourly, the only real T-24h path, commitments only.
- `_shared/awareness/{urgency,deliver,suppress}.ts` — ladder and channel choice.

## 5. Where the UI oversells it

`src/components/settings/TimeRemindersSection.tsx` offers "proactive awareness" and Telegram reminders in one block, next to a timezone note that says "pick one so reminders fire correctly." Nothing there tells you that calendar appointments are only spoken about inside 45 minutes, or that a next-day heads-up only applies to promises, not calendar entries. Someone reading that screen reasonably concludes Echo watches their calendar for them. Today it doesn't.

Plain expectation to set instead: *Echo speaks up when something on your calendar starts soon, when one moves, or when a promise lands mid-meeting. It is not a second alarm clock for every appointment — your calendar app already does that.*

## 6. Recommended rule (not implemented)

Simplest thing that fits the doctrine without becoming spam:

1. **Evening look-ahead, once.** One line, once a day, at a time you choose, covering tomorrow's timed appointments — the shape of the day, not one notice per event. Silent if tomorrow is empty.
2. **Keep the 45-minute "starts soon"** as is.
3. **Keep changed-event and conflict signals** as is — those already earn their interruption.
4. **Telegram as fallback** only when push is unavailable, never both.
5. **Departure/travel timing:** later, and only for appointments with a place.
6. **Fix the duplicate feed** so tomorrow's appointment isn't two rows — otherwise any new reminder speaks twice.

Over-notifying risk is real: two feeds × per-event notices × two channels is four buzzes for one doctor's appointment. That's how a companion becomes noise. One daily look-ahead, deduped by Google UID, single channel.

## 7. Test coverage

Covered today: calendar sense signals, sync reporting/diffs, change normalization, agenda, quiet-hours logic, Telegram reply/panel behavior, the glance gate, reminder phrasing and appointment shape.

Missing: any next-day calendar reminder test (nothing to test yet), scheduled Telegram proactive delivery end-to-end, duplicate suppression across two feeds holding the same Google UID, and a timezone test proving "tomorrow 4 PM Eastern" is judged from the user's zone rather than UTC.

## 8. Bottom line

Echo did nothing wrong — it did nothing at all, and that was the design. Google reminded you because Google owns a reminder feature; Echo has an awareness pipeline and a 45-minute window, and 21 hours out isn't in it. On top of that, every proactive switch on your account is off, so even a perfect pipeline would have stayed quiet.

The honest gap: a meaningful appointment tomorrow should not vanish into silence. One evening look-ahead fixes it without turning Echo into another buzzing app.

## Continuation point

Unchanged: after this reminder behavior is settled, we go straight back to the **per-user Google Gmail/Drive connection work** — the blocker there is still workspace-level App User Connector clients for Gmail and Drive.
