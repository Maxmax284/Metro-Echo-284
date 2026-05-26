
# Vanta Companion Horizon — H1 File Intelligence Pass

Scoped to **Horizon 1** of your prompt. H2/H3 seams noted at the end but not built. No new tables, no auto-AI, no auto-execute. Drafts only. 384px first.

## Phase 0 — Audit (deliverable first, no code)

Before any edits I'll produce a short audit document (`/mnt/documents/vanta-file-intel-audit.md`) covering current state of:

- File upload + staging (`FileUploadCard`, `useStagedUpload`, `StagedFileChips`)
- Conversation attachment flow (`ConversationDock`, `ConversationSurface`, in-composer attach)
- Telegram file ingestion (`telegram-webhook`)
- Email attachment ingestion (`email-inbound`)
- `files-ingest` extraction pipeline + doc-type detection currently in place
- `FileAftermathTray` (already exists — gaps vs. doctrine)
- `CaptureToast` (already exists — coverage by source)
- Memory → Files (`MemoryFilesView`), intake feed, capture route history
- Audit events emitted via `logFileEvent`
- Sensitive handling (`SENSITIVE_DOC_TYPES`, preview gating)
- Briefing inclusion (`briefing-compose`, `DailyBriefingCard`)
- Canvas inclusion paths
- Mobile behavior at 384px for each surface above
- Cost-trigger surfaces (any place that calls AI on render)

Output: a one-page "what exists / what's wired / what's missing / what's risky" map. **You approve before I touch code.**

## Phase 1 — Aftermath + Action Menu hardening

`FileAftermathTray` already exists but is uneven. Tighten it:

- Show: filename, source channel, doc type, confidence, sensitive flag, saved location, needs-review state — in one calm header row.
- Suggested actions become a **primary row (2–3 most relevant)** + **"More" disclosure** for the rest. No button soup.
- AI-tagged actions get an explicit `AI` chip and never fire on mount.
- Sensitive files: hide preview, swap copy to "Hidden by default. Tap to open."
- Add a dedicated `FileActionMenu` component reused in: aftermath tray, file detail in Memory, capture inbox row, and conversation attachment chip — single source of truth.

## Phase 2 — File → operational object drafts

Polish/finish the draft routes. Each one is a **draft + approve**, never silent:

- **File → Reminder**: prefill `ReminderComposer` with extracted date if `extracted_entities.dates[0]` present, else open empty with file context. Always show source file, timezone, confidence.
- **File → Commitment**: switch current insert-immediately path to a draft sheet (title, due, linked entity), approve before insert.
- **File → Note**: draft from `suggested_summary` if present; otherwise prompt user.
- **File → Entity link**: open a small picker (person/project/place) seeded by `extracted_entities.people / locations`. Accepted → write `file_entity_links` (already exists if present; otherwise reuse `linked_*` fields on `ingested_files`).
- **File → Sherlock**: already wired; ensure suggestion-only, never auto-run.
- **File → Briefing candidate**: a "add to tomorrow's briefing" toggle on the aftermath tray, writes a lightweight `briefing_candidate` flag (reuse `aftermath_status` metadata if available; otherwise add a single nullable column — only if no existing field fits).
- **File → Canvas**: explicit "Add to Canvas" action, never automatic.

## Phase 3 — Doc-type intelligence + per-type suggestions

`DETECTED_DOC_TYPES` already covers the taxonomy. Add a **per-type suggested-action map** in `src/lib/fileIntake.ts` so the aftermath tray + `files-ingest` agree on which 2–3 actions to surface first:

- receipt → extract amount, link to expenses, archive
- invoice → extract due date, payment reminder, link to vendor
- booking → extract check-in/out, travel reminder, link to place
- waiver → send/review reminder, link to person
- visa/id_doc/medical → sensitive guard, extract expiry, reminder
- screenshot → extract people/dates, ask, link
- unknown → "What is this?" prompt + manual type picker

No new ML — pure rule mapping over the existing `detected_doc_type`.

## Phase 4 — Batch handling

Add a `batch_id` concept (reuse if it already exists; otherwise a single nullable column on `ingested_files`) — set when multiple files arrive in one upload event from any source. Then:

- `StagedFileChips` + aftermath tray group by `batch_id`.
- Show a batch header with batch-level routes ("Link all to GroundStay", "Mark all needs review").
- Individual file actions still work.

## Phase 5 — CaptureToast unification

`CaptureToast` already exists. Make every source go through it:

- In-app upload ✓
- Conversation attach — wire if missing
- Telegram file — confirm `telegram-webhook` writes a capture row that surfaces in the same toast/inbox
- Email attachment — same
- Default: silent toast + badge, no sound, tap → aftermath tray

Copy: "File captured · Reading it · Saved to Files · Needs review · Open aftermath."

## Phase 6 — Search/memory polish (light)

`MemoryFilesView`: add filters for source, doc type, sensitive, needs-review, linked/unlinked. Use existing columns — no new tables. Results show source, matched reason, linked objects, last action.

## Phase 7 — Audit replay (light)

`logFileEvent` already exists. Add a small "Activity" disclosure in file detail that lists events for that file in plain English ("Uploaded from Telegram · Linked to GroundStay · Reminder created · Archived").

## Phase 8 — 384px sweep

Validate every touched surface at 384px: staged chips, batch header, aftermath tray, action menu, sensitive preview, reminder/commitment drafts from file, link picker, search filters. Fix any overflow, dense rows, or bubble collisions.

## Out of scope (H2/H3 — prepared seams only)

- Morning/evening/weekly briefing integration of file-derived items — leave hooks via existing `briefing-compose` selecting where `review_status='needs_review' AND deadline_today`.
- PWA share target, desktop drop zone, ecosystem adapters — not in this pass.
- Entity profile traits, voice triage loop — not in this pass.

## Hard rules I will not break

- No auto-AI on render. Every AI action requires explicit tap.
- No new top-level surfaces. Everything lands in Inbox / Memory / Aftermath.
- No new tables unless a field genuinely doesn't exist.
- Sensitive previews hidden by default.
- Plan → Approve → Execute for every file-derived object.
- No robotic copy. Vanta voice only.

## Open questions before I start

1. Should I deliver Phase 0 (audit doc) as a single step and wait for your sign-off before touching code, or run audit → Phase 1–2 in one pass?
2. Are batches already tracked somewhere (column or convention) or should I introduce `batch_id`?
3. For "File → Briefing candidate" — do you have an existing briefing-eligibility flag I should reuse, or is a new boolean field acceptable?
