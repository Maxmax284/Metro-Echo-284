
## Audit findings (current state)

- **Files**: `ingested_files` exists with status/metadata/note_id. `files-ingest` extracts text → creates note → emits `ingest.success` audit + nudge. No Files view; files appear only as captures in the intake feed and as notes in Memory. No pipeline state UI, no document_type classification UI, no route actions on files.
- **Reminders**: No separate `reminders` table. The `commitments` table doubles as reminders via `remind_at`. `CommitmentsSurface` and `commitment-reminders` cron exist. No time/timezone rules — `due_at` is whatever the datetime-local picker says, no timezone awareness, no ambiguity handling.
- **Timezone**: `profiles.timezone` column exists but is never written or read anywhere. App silently uses browser local time.
- **Linking**: `note_links` exists (note↔note only). Tags-on-everything is the de-facto link layer. No person/project/place chips, no cross-entity linking helper.
- **Telegram**: Capture lane works. Outbound notifications: `telegram-link` only. No reminder delivery path.
- **Push**: No service worker push, no permission flow. PWA install card exists.
- **Schedule views**: None. Cockpit shows nudges, not "what's due today".
- **Daily briefing**: No briefing surface. `awareness-brief` is place-only.
- **Settings**: API Control Room only. No Time & Reminders section.
- **Companion time queries**: Intents handle capture/commitment/sherlock; no "what's due today" query path.

## Scope for this pass

Implement Stages 1–4, 7–9 from the prompt. Stage 5 (Telegram delivery), 6 (push), 11 (Google Calendar) are explicitly staged for later with hooks in place.

### Stage 1 — Files pipeline visibility (Memory → Files tab)
- Add `MemoryFilesView` component, rendered as a third tab inside `MemorySurface` alongside Notes / Captures.
- One card per `ingested_files` row: filename, source, upload time, mime, status pill, detected document_type (already written by `files-ingest`), confidence, linked note, audit-trail link.
- Status copy uses Vanta voice: "Uploaded.", "Reading it.", "Saved.", "Couldn't read this one.", "Needs review."

### Stage 2 — File route actions
- On each file card: Open note, Re-classify (no AI), Correct type (dropdown of receipt/invoice/contract/admin/booking/screenshot/checklist/unknown — stored in `metadata.document_type`), Create reminder, Attach to commitment, Send to Sherlock, Archive (sets `metadata.archived=true`).
- All emit audit events (`file.type_corrected`, `file.routed`, `file.archived`, `file.reminder_created`).

### Stage 3 — Lightweight linking (metadata-first, no new tables)
- Add `links` array on `notes.metadata` and `commitments.metadata` and `ingested_files.metadata`: `[{kind:"person"|"project"|"place", label, ref?}]`.
- New `LinkChips` component renders chips like "Linked to Nikki" and offers `+ Link person/project/place` → opens a small popover with free-text or pick-from-recent (recent labels pulled from existing metadata across the user's notes — cheap, no new table).
- Wire into Memory note cards, Commitments cards, Files cards. Empty state: "No strong links yet."
- Audit: `link.added`, `link.removed`.

### Stage 4 — Reminder + timezone foundation
- Use `commitments` as the reminder table (already has `remind_at`, `due_at`, `priority`, `status`). Add a `kind` discriminator to `commitments.metadata` (`"reminder"` vs default commitment) — no schema change.
- `profiles.timezone` becomes the source of truth. New `useUserTimezone()` hook reads it; falls back to `Intl.DateTimeFormat().resolvedOptions().timeZone`.
- All due-date display switches to `formatInTimeZone` from `date-fns-tz` using user TZ. Show TZ label next to times ("7:00 PM Asia/Bangkok").
- Reminder time rules in a new `ReminderComposer` (used from notes, files, captures, commitments, Companion):
  - Specific time → schedule.
  - Vague time + default configured → suggest "Tonight usually means 7 PM. Use that?"
  - Vague + no default → ask.
  - No time → ask.
  - AM/PM ambiguous → ask.
  - Other TZ stated → respect, show "Scheduled for 9:00 AM America/New_York."
- "Create reminder" actions added to Memory notes, Capture cards, File cards, Commitment cards.

### Stage 7 — Today / Upcoming / This Week
- New `ScheduleSurface` (added to nav as "Today", uses Calendar icon). Three tabs.
- Pulls from existing data only:
  - Commitments due/overdue.
  - Reminders (commitments with `metadata.kind=reminder`).
  - Captures with `needs_review=true`.
  - Files where `status='needs_review'` or `metadata.document_type` missing.
  - Actions with `status='proposed'|'staged'`.
- Each row shows source chip and links back to its surface.
- Mobile-first: full-width cards, large tap targets.

### Stage 8 — Daily briefing (cheap, no AI by default)
- New `DailyBriefingCard` rendered at top of Cockpit and inside Schedule → Today.
- Generated client-side from counts: "Today: 3 reminders, 2 commitments, 4 captures waiting, 1 file needs review."
- Then a short list of the top items.
- Optional "Polish with Vanta" button → calls `vanta-converse` once with the briefing as input; default off.
- Audit: `briefing.generated`, `briefing.ai_polished`.

### Stage 9 — Companion time queries (no AI when avoidable)
- Add intent handlers in `useIntentHandler`: `query_due_today`, `query_upcoming`, `query_waiting`, `query_files_needing_review`.
- Each runs a direct DB query, formats a plain-English answer, posts it as an assistant message. AI only invoked for summarization if user asks "summarize my week" style.

### Settings — Time & Reminders section
- New section in `Settings.tsx`: timezone picker (searchable, common zones first), auto-detect toggle, default morning/afternoon/evening times, quiet hours start/end, delivery preferences (in-app on; Telegram + Push shown as "Coming soon" / staged toggle that writes preference but does not deliver yet).
- Drift banner if browser TZ ≠ saved TZ.
- Persists to `profiles.timezone` and new `profiles.metadata` (or a tiny `user_preferences` JSON column — see Technical).
- Audit: `timezone.updated`, `timezone.autodetected`.

### Audit coverage
- Add events listed in the prompt where missing. All UI changes use Vanta voice.

### Staged (not built this pass)
- Stage 5 — Telegram reminder delivery (delivery toggle exists in Settings as "Coming soon"; audit events reserved).
- Stage 6 — PWA push (settings stub only).
- Stage 11 — Google Calendar (not touched).

## Technical notes

- **No schema migration needed** for Stages 1–4 + 7–9 if we use:
  - `commitments.metadata` (jsonb) for `kind:"reminder"`, `links:[]`, `timezone`.
  - `notes.metadata.links`, `ingested_files.metadata.links`, `metadata.archived`, `metadata.document_type`.
  - `profiles.timezone` (existing column).
- **One small migration** for user preferences: add `profiles.preferences jsonb default '{}'` to hold `default_morning_time`, `default_evening_time`, `quiet_hours_start/end`, `telegram_reminders_enabled`, `push_reminders_enabled`. Cheaper than a new table; profile is already per-user.
- **Dependency**: add `date-fns-tz` for timezone-correct formatting.
- **No new edge functions** required this pass; existing `commitment-reminders` cron continues to work and will pick up reminders since they're just commitments with `metadata.kind="reminder"`.
- **No automatic AI calls.** All AI is behind explicit user taps.
- **Files**: no real classifier yet — `metadata.document_type` is set by user "Correct type" action or by a cheap keyword heuristic at ingest time (already partially present from earlier pass). UI clearly says "Needs review" until set.

## Files touched (approx)

New:
- `src/components/memory/MemoryFilesView.tsx`
- `src/components/memory/FileCard.tsx`
- `src/components/links/LinkChips.tsx`
- `src/components/reminders/ReminderComposer.tsx`
- `src/components/surfaces/ScheduleSurface.tsx`
- `src/components/cockpit/DailyBriefingCard.tsx`
- `src/hooks/useUserTimezone.ts`
- `src/hooks/useUserPreferences.ts`
- `src/lib/timeRules.ts` (vague-time parser + AM/PM disambiguation)
- `src/components/settings/TimeRemindersSection.tsx`

Edited:
- `src/components/surfaces/MemorySurface.tsx` (Files tab, link chips, "Create reminder")
- `src/components/surfaces/CommitmentsSurface.tsx` (TZ-correct display, link chips, reminder kind)
- `src/components/memory/CapturesView.tsx` (Create reminder action)
- `src/components/surfaces/CommandCenterSurface.tsx` (DailyBriefingCard mount)
- `src/components/shell/SurfaceTabs.tsx` (Schedule tab)
- `src/hooks/useIntentHandler.ts` (time query intents, TZ-aware add_commitment)
- `src/pages/Settings.tsx` (Time & Reminders section)
- `src/lib/vantaVoice.ts` (new copy)
- One migration: `profiles.preferences jsonb`.
