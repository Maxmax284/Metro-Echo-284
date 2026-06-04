# Vanta Voice + Plain-English Copy Pass

Goal: make Vanta sound like a calm front-desk operator. Centralize copy so future tone modes + locales drop in cleanly. No data model changes, no execution behavior changes.

## Approach

Three layers, built bottom-up:

1. **Meaning** — keep existing `PlainItem` in `src/lib/plainEnglish.ts`. Untouched as a data shape.
2. **Voice** — new `src/lib/vantaVoice.ts`: copy keys, phrase builders, tone-aware renderer. Default tone = plain+warm+direct.
3. **Surfaces** — replace robotic strings with `voice.*` calls. Raw event codes stay only in Audit / source trails.

## Wave 1 — Voice helper foundation

Create `src/lib/vantaVoice.ts`:

- `type Tone = "plain" | "warm" | "direct" | "bodega" | "professional" | "minimal"`
- `type Surface = "briefing" | "capture" | "sherlock" | "file" | "note" | "reminder" | "connected_account" | "error" | "empty"`
- `voice.<key>(vars)` phrase builders for the dictionary in the prompt (booking_state_changed, guest_message_needs_review, file_needs_routing, possible_connection_found, reminder_overdue/due_today/snoozed, connected_account_summary, nothing_in_lane, everything_calm, cannot_access_workspace, lookup_failed, integration_paused, action_opens_review, action_opens_draft, action_requires_approval, etc.)
- `renderVantaCopy(item: PlainItem, opts?)` — convenience that picks builder by `item.verb`/surface
- `confidenceCopy(word)` — "Likely match" / "Possible match" / "Needs review"
- `tapHint(kind)` — "Opens review. Nothing changes yet." / "Opens a draft. Nothing is sent." / "Approval needed before anything is sent."
- All strings English-only for now; structure is locale-ready (single map keyed by `en`).

## Wave 2 — Top surface rewrites

Priority order from the prompt:

1. **OperationsBriefingPanel** — verdict + "What matters" / "Best move" / empty state already shipped; swap remaining robotic strings ("External signal ingestion", count-led lines, "Based on N sources" → "Receipts: …") through `voice.*`.
2. **CommandCenterSurface / LiveCaptureCard** — route every row through `humanizeBriefingItem` + `voice.captureLine()`; kill event-code soup in titles.
3. **SherlockFindingCard + SherlockHintChip + SherlockSurface** — labels via `voice.sherlock.*`; honest confidence copy.
4. **FileAftermathTray + MemoryFilesView + CaptureCard (file)** — `voice.file.needsRouting / sensitive / looksLike`.
5. **Reminders (ReminderComposer, CommitmentsSurface, CommitmentActions)** — `voice.reminder.overdue/dueToday/snoozed/none`.
6. **NudgesPanel / Notes** — `voice.note.added/looksLikeFollowup/mayBecomeReminder`.
7. **ConnectedAccounts + IntegrationCard** — "Telegram captured 3 items today. 1 still needs routing." pattern using existing activity counts.
8. **Errors + empty states** — sweep `toast.error`, empty placeholders, and missing-secret banners through `voice.error.*` / `voice.empty.*`.

## Wave 3 — Tap clarity + role copy

- `AftermathFooter` default `whatHappensIfTap` pulled from `voice.tapHint(kind)`; approval-required next-moves prefix "Approval needed —".
- Role/workspace messages: replace `"You do not have permission…"` style with `voice.access.notInLane()` / `voice.access.notInRole()`. Never leak hidden source names.
- Admin/system copy in `IntegrationsSettings`, `EcosystemSourcesPanel`, `CostTelemetryPanel`, `MissingSecretsBanner` — plain English but slightly more technical allowed.

## Out of scope

- No tone-mode picker UI, no language switcher, no schema/migration changes.
- No edge-function logic changes; only string-level copy in returned summaries where safe (`briefing-compose` verdict strings stay as already shipped).
- No redesign — only string swaps and the new voice helper.
- WhatsApp / new surfaces.

## Acceptance

- Mobile 384px: every rewritten line still fits without truncation in normal cases.
- No event codes (`gth.booking.created`, `external_signal`, `capture_route`) visible outside Audit / source trails.
- Empty states warm, errors calm + honest, tap copy explains what happens.
- All new strings live in `vantaVoice.ts` (or are explicit one-offs); no scattered duplicates.

## Risks

- Touching many files; risk is purely textual regression. Will keep edits surgical (string-level) and avoid restructuring components.
- Some surfaces already humanize via `plainEnglish.ts`; voice layer will wrap, not replace, those helpers.

Plan-only. No files written until approved. After approval I'll ship Wave 1 + Wave 2 in one pass, then Wave 3.
