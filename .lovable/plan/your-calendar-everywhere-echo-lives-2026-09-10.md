# Your calendar, everywhere Echo lives

Three asks, and two of them are closer to done than they look. Here is what is
actually true today, and what is left to build.

## What already works

- Your own Google account is connected per person (not through my account), and
  an approved change writes to that person's Google calendar with a receipt.
- A background pass already pulls your real Google calendar into Metro Echo
  every 20 minutes, on its own, with no Telegram step involved. Changes made in
  Google land in Today and Schedule by themselves.
- Settings already has a Calendar door, and "Sign in with Google" already lives
  inside it (currently on the shared Time & reminders page).

So the remaining work is: make the sync feel live rather than every-20-minutes,
give Calendar its own obvious settings page, and build the Telegram day view.

## 1. A calendar view in Telegram

Ask Echo "what's my day", "what's tomorrow", "show me the week" and get back one
readable board of your real Google events — not a paragraph.

Each day reads as a short list: time, event, place. Above the list, anything
happening right now is marked as ongoing. Under each event, Echo adds overlay
lines from Work when they belong to that slot:

- a promise you owe that is due that day
- a change waiting for your Yes
- a conflict or overlap between two events

Overlays are labelled as Echo's read, never mixed in as if Google said them.
The board stays a read: no buttons that change anything, except the Yes/No that
already belongs to a pending change. Nothing new gets staged just by looking.

Also add `/day` and `/week` so it works without phrasing it as a question.

## 2. Make the sync feel continuous

- Tighten the background pass from every 20 minutes to every 5.
- Refresh once when you open the app or open Schedule, so what you see is what
  Google has right now, not what it had at the last pass.
- Keep reporting the diff, not a status: "Wingate moved an hour later" beats
  "synchronized". That reporting already exists and keeps working.
- No staging, no approval, no Telegram involvement for reads — a change made in
  Google simply appears.

## 3. Calendar gets its own settings page

Split calendar out of Time & reminders into its own page:

- "Sign in with Google" at the top, with the connected account shown once it is,
  plus Disconnect and a Sync now action.
- Below it, calendar links (the paste-a-link option) kept and honestly labelled
  as read-only.
- The existing Settings tile points at this new page instead.

Anyone on Metro Echo connects their own account there. Nothing about the flow is
specific to my account.

## Not building

No Calendar room, no month grid, no separate calendar engine for Telegram.
Telegram reads the same events, same approvals, same receipts as the app.

## Technical notes

- New shared `calendarAgenda.ts` builds the day/week board from `calendar_events`
  plus overlay rows from `commitments` and staged `actions` (`calendar_change`),
  used by the Telegram webhook and reusable by Ask. Overlays carry their own
  `source` so copy can label them as inference.
- Telegram: new `show_calendar_view` tool plus `/day` and `/week` handlers,
  rendering through the agenda builder; existing `whats_on_calendar` stays for
  narrow one-line answers.
- Sync cadence: update the `vanta-calendar-sync` schedule to `*/5 * * * *`;
  add a debounced client refresh (one call per session per surface open) in the
  Today and Schedule paths that already invoke `calendar-sync`.
- Settings: new `calendar` group in `settingsGroups.tsx` rendering
  `GoogleCalendarConnectCard` above `CalendarFeedsSection`, remove the calendar
  block from the `time` group, repoint `CalendarQuickConnect` at
  `/settings/g/calendar`.
- Tests: agenda grouping (ongoing, all-day, empty day), overlay attachment and
  labelling, `/day` and `/week` output, and no-staging-on-read.
