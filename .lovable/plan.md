# Vanta Upload Flow Polish — Plan

Front-end UX pass over the existing `ingested_files` pipeline. No new tables, no new storage system, no auto AI. Reuses `files-ingest`, `fileIntake.ts` schemas, and `MemoryFilesView`.

## Audit findings (current state)

- `FileUploadCard` and `ConversationSurface.handleAttach` both upload immediately on file pick — no stage step, no remove, no per-file progress, no inline retry.
- `ConversationSurface` auto-fires `analyze-file` AI tool right after ingest — violates "no auto AI on upload".
- No `CaptureToast` primitive exists. Telegram file ingest writes to `ingested_files` but produces no in-app surfacing beyond the realtime list.
- `MemoryFilesView` exists and is the right home for the file detail. No aftermath tray today.
- `fileIntake.ts` already defines `suggested_actions`, `review_status`, `detected_doc_type`, `sensitive` — aftermath tray can render from these directly.
- Audit events for `file.*` are sparse — only ingest start/finish.

## Wave A — Staged chip row + per-file progress

Shared component, reused everywhere.

- New `src/components/files/StagedFileChips.tsx` — chip per file with name, size, type icon, remove (✕), optional note input.
- New `src/hooks/useStagedUpload.ts` — owns staged[], per-file state `queued | uploading | reading | saved | failed`, per-file progress where the upload helper exposes it, retry per file, cancel before commit. Emits audit events `file.staged`, `file.upload_started`, `file.uploaded`, `file.upload_failed`, `file.extraction_started`, `file.extracted`, `file.extraction_failed`.
- Rewire `FileUploadCard` to use the hook + chips (drop the immediate upload path).
- Rewire `ConversationSurface.handleAttach` to use the same chips above the composer. **Remove the auto `analyze-file` send.** Replaced by an aftermath suggestion "Ask about this file" the user can tap.
- Paste support: image paste in conversation composer stages as chip.
- Error copy via `vantaSay` ("This one did not upload. Try again." / "I could not read this file yet.").
- Mobile: chip row scrolls horizontally with `flex-wrap`, ✕ has ≥40px hit target, fits 384px.

## Wave B — Aftermath tray

- New `src/components/files/FileAftermathTray.tsx` — renders for a just-completed file. Shows filename, `detected_doc_type`, confidence, "Saved to Memory → Files", `needs_review` tag if unrouted, and suggested-action buttons sourced from `suggested_actions` (fallback to a small default set: Ask, Summarize, Extract tasks, Extract dates, Link, Create reminder, Create commitment, Send to Sherlock, Archive).
- Appears inline under chips in both surfaces. Stays visible until dismissed (per doctrine).
- Action handlers: each emits its audit event (`file.summarize_requested`, `file.linked`, `file.reminder_created`, etc.) and routes through existing draft/Plan→Approve flow. No silent execution; AI calls only behind explicit tap.
- Sensitive doc types (`fileIntake.isSensitiveByType`) hide preview, mark `needs_review`, and require explicit tap to open.
- Untouched files remain in `MemoryFilesView` with `review_status = needs_review`.

## Wave C — Unified CaptureToast

- New `src/components/capture/CaptureToast.tsx` + `useCaptureToast` provider mounted near root (Index.tsx). Listens to `ingested_files` realtime inserts/updates (channel already exists in `useIntakeFeed`) and dedupes by `id`.
- Toast shape: source pill (Upload / Conversation / Telegram / Email), filename, status verb ("Reading it" / "Saved" / "Needs review"), "Open" → routes to Memory → Files filtered to that file with aftermath tray expanded.
- Silent by default, no sound. Single toast per file id.
- Telegram file ingest already writes rows → no edge function changes needed; the toast picks them up. If app was closed, an unseen-captures badge on the Memory tab surfaces on next open (count from `review_status in ('new','needs_review')` since last seen `localStorage` timestamp).
- Audit: `capture.toast_shown`, `capture.toast_opened`.

## Wave D — Files tile in Command layer

- Add a Files tile to `CommandCenterSurface` showing three counts pulled from `ingested_files`:
  - New today (`created_at >= today`).
  - Awaiting triage (`review_status in ('new','needs_review')`).
  - Linked to active project (join via existing entity links if cheap; otherwise hide the third row).
- Tap → opens Memory → Files (existing view, no new route).
- Tile includes a small drag-drop zone that delegates to the same `useStagedUpload` hook. No duplicate upload code.

## Audit events

Centralize in `src/lib/fileAudit.ts` — single helper `logFileEvent(kind, payload)` writing to `audit_log`. Event vocabulary matches spec.

## Voice

All copy goes through `vantaSay.*`. Extend it with: `fileQueued`, `fileUploading`, `fileReading`, `fileSaved`, `fileNeedsReview`, `fileUploadFailed`, `fileUnreadable`, `fileArchived`. Voice-guardrail test allow-listed.

## Out of scope (per spec)

New storage backend, Drive/Dropbox, document editor, auto-summarize, hard delete, new OCR provider, Sherlock rebuild, Calendar.

## Build order

A → B → C → D, each shippable independently. Mobile 384px validated at end of each wave.

## Files

**New**
- `src/components/files/StagedFileChips.tsx`
- `src/components/files/FileAftermathTray.tsx`
- `src/components/capture/CaptureToast.tsx`
- `src/hooks/useStagedUpload.ts`
- `src/hooks/useCaptureToast.ts`
- `src/lib/fileAudit.ts`

**Edited**
- `src/components/FileUploadCard.tsx` (use hook + chips + tray)
- `src/components/surfaces/ConversationSurface.tsx` (chips + tray; remove auto-analyze)
- `src/components/surfaces/CommandCenterSurface.tsx` (Files tile)
- `src/pages/Index.tsx` (mount CaptureToast provider)
- `src/lib/vantaVoice.ts` (new copy)
- `src/test/voice-guardrail.test.ts` (allow new files)

**Untouched (intentionally)**
- `supabase/functions/files-ingest/*`, `telegram-webhook/*`, `email-inbound/*`, `ingested_files` schema, `fileIntake.ts` schemas.
