## Audit findings (current state, before any changes)

**Files (Stage 1)**
- `MemoryFilesView` exists as a Memory tab; cards show filename/source/status/document_type, support Open note, Correct type, Create reminder, Send to Sherlock, Archive, Upload.
- Pipeline status copy is partially Vanta-voice; still mixes raw `status` strings ("done", "pending") in a few spots.
- Missing: re-classify (no-AI heuristic re-run), attach-to-commitment, create-action-draft from a file, audit-trail link on the card, linked-person/project/place rollup on file cards.
- Audit events present: `file.reminder_created`, `file.ingest_retried`. Missing: `file.type_corrected`, `file.routed`, `file.archived`, `file.sent_to_sherlock`, `file.attached_to_commitment`.

**Linking (Stage 2)**
- `LinkChips` exists; mounted on Memory notes and Commitments. Not mounted on Files, Captures, Reminders, or Schedule items.
- Metadata-first model in place (`metadata.links: [{kind,label}]`). Recent-labels picker reads across notes/commitments only.
- Audit `link.added` / `link.removed` is wired in `LinkChips` itself, so mounting it on more surfaces inherits audit for free.

**Time / Reminders / Settings (Stage 3)**
- `useUserTimezone`, `useUserPreferences`, `ReminderComposer`, `TimeRemindersSection` all exist.
- Timezone picker, auto-detect, drift banner, quiet hours, default morning/afternoon/evening, Telegram opt-in toggle are present.
- `commitments` doubles as reminders via `metadata.kind="reminder"`. `remind_at`/`due_at` are written in user TZ via composer.
- Gaps: no `reminder.needs_time` / `reminder.scheduled` audit events on composer save; AM/PM disambiguation lives in `timeRules.ts` but composer doesn't always surface the prompt; no `timezone.manual_override` event.

**Telegram delivery (Stage 4)**
- `commitment-reminders` cron sweeps and emits `commitment.due_soon` / `commitment.overdue` into `audit_log`. **It does not send Telegram messages.** No quiet-hours check. No per-user opt-in check. No dedupe beyond a 6h `last_reminded_at` throttle.
- `telegram_chat_links` table + `telegram-webhook` (inbound) exist. Outbound send helper exists in `telegram-link` only.
- Settings already has `telegram_reminders_enabled` toggle (off by default).

**Push (Stage 4)**
- No service worker, no `Notification.requestPermission` flow, no push UI. PWA install card only.

**Schedule / Today / Briefing (Stage 5)**
- `ScheduleSurface` with Today/Upcoming/Week tabs, `DailyBriefingCard` (counts-first, no AI), `ScheduleQueryChips` all exist.
- Briefing has no "Polish with Vanta" opt-in button. No `briefing.generated` / `schedule.viewed` audit. Overdue is folded into Today, not a distinct chip on Schedule itself.

**Companion / Sherlock (Stage 6)**
- `useIntentHandler` handles `query_schedule` (today/tomorrow/week/overdue/next) with TZ-correct formatting.
- Missing intents: `query_waiting` (captures awaiting routing), `query_files_needing_review`, `query_aftermath` ("what happened to X").
- Sherlock: investigates free-text only. No object-handoff from Files/Memory/Captures/Commitments. No evidence-tier display, no link-back from Sherlock case to source object.

**Mobile / PWA**
- Recent passes verified Schedule/Daily Briefing at 384px. `ReminderComposer`, `MemoryFilesView`, `TimeRemindersSection`, `SherlockSurface` have not been re-validated at 384px in this pass.
- PWA install card present. Standalone-mode hiding of install prompt not verified.

---

## Implementation plan (Stages 1–6, no Google Calendar)

### Stage 1 — Files pipeline + route actions
- Normalize all file-card status copy through a single `fileStatusLabel()` helper in `vantaVoice.ts` (Uploaded / Reading it / Saved / Needs review / Couldn't read this one / Filed away).
- Add to each file card: **Attach to commitment** (picker of open commitments → writes `metadata.attached_file_ids`), **Re-classify** (runs keyword heuristic from `files-ingest`, no AI), **View audit trail** (link to Audit filtered by `entity_id`), and a one-line link rollup ("Linked to Nikki · GroundStay").
- Emit audit: `file.type_corrected`, `file.routed`, `file.archived`, `file.sent_to_sherlock`, `file.attached_to_commitment`, `file.reclassified`.

### Stage 2 — Linking everywhere relevant
- Mount existing `LinkChips` on: `FileCard` inside `MemoryFilesView`, `CaptureCard` (CapturesView), `CommitmentsSurface` reminder rows, and Schedule item rows where space allows (compact variant, max 2 chips + "+N").
- Extend recent-labels picker to read across `ingested_files.metadata.links` and `messages.metadata.links` too.
- No new tables, no new audit events (LinkChips already emits `link.added`/`link.removed`).

### Stage 3 — Reminder / TZ polish
- `ReminderComposer`: surface AM/PM disambiguation prompt when `timeRules.detectAmbiguity()` returns true; surface vague-time default prompt ("Tonight usually means 7 PM. Use that?"); emit `reminder.needs_time` when saved as draft without time, `reminder.scheduled` when saved with time.
- TimezoneSection: emit `timezone.manual_override` when user picks zone after device-drift banner shown.
- No schema changes.

### Stage 4 — Telegram delivery (live, opt-in) + Push readiness (staged)
- Extend `commitment-reminders` cron:
  - For each due item, look up `profiles.preferences.telegram_reminders_enabled` and `telegram_chat_links` for that user.
  - Skip if disabled, no chat link, in quiet hours (unless `priority='urgent'`), or `metadata.telegram_sent_at` already set for this `last_reminded_at` window.
  - Send via Telegram `sendMessage` using `TELEGRAM_BOT_TOKEN`; on success write `reminder.telegram_sent` + stamp `metadata.telegram_sent_at`; on failure `reminder.telegram_failed`; on quiet-hours skip `reminder.telegram_skipped_quiet_hours`.
- Push: add a `PushReadinessSection` in Settings. Detect `'serviceWorker' in navigator && 'PushManager' in window`. Show status (Supported / Unsupported / Blocked / Off). Enable button only requests permission on tap. No service worker registration yet — copy says "Push is staged. We'll turn it on once delivery is verified." Emits `push.permission_requested`, `push.permission_granted`, `push.permission_denied`.

### Stage 5 — Schedule / Briefing polish
- Add **Overdue** as a distinct Schedule tab (currently a chip inside Today). Today stays focused on "due today + needs review".
- Daily Briefing: add **Polish with Vanta** button (manual tap → single `vanta-converse` call, audit `briefing.ai_polished`). Always emit `briefing.generated` on first render per session.
- Emit `schedule.viewed` with `{tab}` on tab change (debounced).

### Stage 6 — Companion aftermath + Sherlock object handoff + Mobile/PWA
- New intents in `useIntentHandler`: `query_waiting` (captures with `needs_review=true`), `query_files_needing_review` (`status='needs_review'` or `metadata.document_type` missing), `query_aftermath` (given an entity ref, walk `audit_log` for that `entity_id` and produce a plain-English timeline).
- Sherlock object handoff: add `SendToSherlockButton` invocations from FileCard, MemoryNote, Capture, Commitment that pre-fill investigation context with a structured `{entity_type, entity_id, summary}`. SherlockOverlay renders a "Investigating: <object>" header and writes the resulting case back as `audit_log.event='sherlock.case_linked'` with `entity_id` pointing at the source.
- Sherlock evidence tier: render the existing confidence value with three-tier copy ("Worth checking" / "Likely" / "Confirmed by your records").
- Mobile sweep at 384px for: `ReminderComposer`, `MemoryFilesView`, `TimeRemindersSection`, `PushReadinessSection`, `SherlockSurface`. Fix any overflow, crowded chips, hidden primary actions.
- PWA: in `InstallVantaSection`, hide install CTA when `matchMedia('(display-mode: standalone)').matches`.

### Out of scope (per prompt)
- No Google Calendar.
- No live push delivery (only readiness UI + permission flow).
- No new tables — all stages use existing `commitments`, `ingested_files`, `notes`, `messages`, `audit_log`, `profiles.preferences`.

### Technical notes
- One small change to `commitment-reminders` edge function adds Telegram send + quiet-hours/opt-in checks. Requires existing `TELEGRAM_BOT_TOKEN` secret (already used by `telegram-link`/`telegram-webhook`).
- Quiet-hours check: compute current local time in `profiles.timezone`, compare against `quiet_hours_start`/`end` (handles wrap past midnight).
- Dedup: stamp `metadata.telegram_sent_at` on the commitment after send; cron skips if within 6h.
- No new dependencies.

### Acceptance gate
- Audit findings shipped above before any code change. ✓
- Each stage's acceptance bullets from the prompt verifiably hit; staged items clearly labeled in UI (push delivery, Google Calendar).
- 384px walkthrough re-run on every surface touched.
