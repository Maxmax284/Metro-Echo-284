# Metro Echo — Release-Grade Smoke Test Plan

Audit turn only. Everything below is grounded in code that exists today.

## A. Smoke-testable today

- **Four rooms** — `src/lib/navigation.ts` (`PRIMARY_ROOMS`, `SURFACE_PARENT`), `SurfaceTabs.tsx`. Desks (projects, briefs, schedule, commitments, actions, awareness, sherlock, inbox) already hang off Work.
- **Today** — `TodaySurface.tsx` hero read + sections, `useSituation`, `useArrivals`, `FieldSessionCard`, `EveningReadCard`, shell weather via `useShellWeather` writing `operational_state_events`.
- **Work** — projects (`Projects.tsx`, `ProjectBriefView.tsx`: Summarize, Export, notes, attach), documents (`Documents.tsx`, `NewDocumentDialog`, `DocumentDetailSheet`), briefs (`BriefComposerSheet`, `BriefExportsList`), commitments, schedule, Sherlock.
- **Ask** — `ConversationSurface`/`ConversationDock` + `vanta-converse`, thread context strip (`askCapabilities.ts`), file attach, `LookAtSheet` → `perception-look`.
- **Receipts** — `AuditSurface.tsx` (audit_log + action_events, realtime, filters, `ReceiptUnfold`, `AuditDetailDrawer`) and `HeldBackPanel` reading real `awareness.evaluated` suppression records.
- **Telegram** — `telegram-webhook` (inbound capture, file/voice intake with `firstPassIntake`, commitment callbacks, field/trip intents, `Why this?` line), `telegram-status`, `telegram-test`, `telegram-send`, `/settings/telegram`.
- **Aware** — `AwarenessMap`, saved places, nearby places, snapshot weather incl. hourly, arrivals lane, section briefings with the changed/diff layer.
- **Trips** — `trips` + `trip_points`, `tripSession.ts` with `trip.started/ended/held_open/checked_in` receipts; readable in app via `useFieldSession`/`FieldSessionCard`.
- **PDF artifact lane** — `compose-brief` → `briefs.ts` (`saveBriefDraft`, `approveAndExportBrief`) → `brief_exports` row + `memory-uploads` storage + signed download; receipts `brief.generated`, `pdf.generated`, `brief.exported`. Presets in `exportPresets.ts` (daily command brief, project summary, receipt capture packet). Document review packet via `documentExport.ts` (`document.export_drafted`, `document.exported`).

## B. Partially testable — gaps that would mislead

1. **DOCX lane is not a persisted artifact.** `documentDocxExport.ts` builds the file in the browser and downloads it; nothing is written to storage or `brief_exports`. Only an audit row (`document.exported_docx`) exists. So "open/download/reopen" and lineage can be claimed for PDF, not Word.
2. **Trips can only be started from Telegram.** `tripSession` is called solely from `fieldReply.ts` via the webhook. Metro Echo reads and can arrive/mark a stop, but cannot start/end a trip — one-directional shared state, not symmetrical.
3. **Documents have no conversation link.** `documents.project_id` and `source_file_id` exist; there is no `conversation_id`. An Ask-created document cannot be traced back to the thread that produced it.
4. **Suppression evidence depends on the sweep having run.** `HeldBackPanel` only sees `awareness.evaluated` rows from `awareness-drift-sweep`. Without a sweep in the window, Receipts truthfully shows nothing — that is not proof of suppression working.
5. **`audit_log` has no FKs.** The chain is joinable by `entity_type`/`entity_id` convention only; a broken link is silent.
6. **Fresh-user path** — `FirstRunWalkthrough`/`TutorialProvider` exist, but a fresh account has no places, no Telegram link, no calendar feed, so several rooms will be legitimately empty.

## C. Not testable yet

- Proof Pack assembly with screenshots: `BriefPdfDocument` has no image section kind and `Brief` has no attachment field. No screenshot can be embedded in any generated artifact today.
- Server-side artifact generation (all PDF/DOCX bytes are client-side, so no headless generation without a browser).
- Ending/starting a trip from the app; SOS/Walk-With-Me beyond posture flags.
- Cross-artifact lineage graph (no artifact→artifact linkage table).

## D. Golden path (one scenario, one Echo)

1. Capture Today baseline (calm/pressure state, ranking, what's on the list).
2. Work → create project "Harbour Street survey", add a note, attach one clean PDF-ish document via New document.
3. Telegram → send a text intent, a clean file, and a low-quality photo; start a trip, append a point.
4. Metro Echo → confirm the trip and the two files appear (Today field card, Aware map/points, Inbox needs-review).
5. Ask → ask a cross-source question requiring the project, the Telegram file, and current place; check grounding and Why this.
6. Work → Summarize the project (living brief), then Export → PDF; confirm `brief_exports` row, download, reopen.
7. Document lane → draft, review, export PDF (operator + client) and Word; note the Word asymmetry.
8. Telegram → end the trip; confirm closure lands in app.
9. Receipts → walk the chain for every step above and read Held back.
10. Re-read Today; confirm it changed for the right reasons and only relevant items surfaced.

## E. Failure paths

Stale/imprecise location; unreadable photo (expect "couldn't read it" not a guess); incomplete document (missing/unclear must be named); Telegram disconnected (`telegram-status` unhealthy); question with no source (expect refusal); export attempted with no draft/review (`documentDocxExport` throws — check the user-facing copy); trip point with no nearby saved place; sweep-less Receipts window.

## F. Screenshot checklist

Today before / Today after; Work project brief; document detail with review; Ask answer with grounding + Why this; Telegram thread (capture, file, trip start/end); Aware map with trip points and place truth; Receipts filtered chain; Held back panel; brief export list; artifact first page; each failure state. Captured at 384px and desktop.

## G. Artifact checklist

Facts traceable to real rows; Metro Echo / Echo branding and no legacy Vanta strings; project/entity linkage on `brief_exports`; storage path + signed URL reopen; receipts present (`pdf.generated`, `brief.exported`, `document.exported`, `document.exported_docx`); page-by-page visual QA; Word file opens and matches the PDF facts.

## H. Receipts checklist

For each golden-path step, confirm the recorded events exist and join up: `telegram.message_in` / `capture.needs_review` → `page.read`/`image.looked`/`document.extracted` → `capture.routed` → `awareness.evaluated` (surfaced or suppressed) → `nudge.proposed`/`delivered` → `execute.success` → `document.draft_created`/`brief.generated` → `brief.exported`. Any missing link is a finding, not a rounding error.

## I. Telegram / Aware / cross-door checklist

Same thread and context both directions where supported; project asked about from Telegram; file from Telegram usable in Ask and visible in Work; Ask-made brief visible in Work; action in Ask visible in Receipts; trip state identical in Today, Aware, and Telegram; place precision and staleness labelled.

## J. Fresh user + 384px

New account: first project, first source, first Telegram link, first Ask, first brief, first artifact, first Receipts read, first local read. Record every point needing insider knowledge. At 384px check tap targets, heading hierarchy, no text shrinking, same truth as desktop. Accessibility: reduced motion honoured, visible focus, contrast, no colour-only meaning.

## K. Instrumentation to add before running (small, real, no test-only architecture)

1. `document_id`/`brief_export_id` echoed into audit payloads where missing, so the chain joins without guessing.
2. Persist DOCX to `memory-uploads` and record it on the same `brief_exports` row, making Word a real artifact.
3. Allow starting/ending a trip from the app through the same `tripSession` helpers (no second trip system).
4. Optional `conversation_id` on `documents` so Ask-born artifacts trace back to the thread.
5. A manual "run awareness sweep now" trigger from Receipts so suppression evidence is reproducible.

## L. Execution order

K1 → K2 → K3 → K4 → K5, then golden path, then failure paths, then fresh user, then 384px/accessibility, then assemble the Proof Pack.

## M. Proof Pack (concept only, not built this pass)

Assembled from the existing brief primitive plus a new `image` section kind in `BriefPdfDocument`: cover (date/build/commit), scenario and environment, pass/fail matrix, room and Telegram screenshots, Aware evidence, briefing/artifact samples, receipt chain, held-back examples, failures, discrepancies with severity, and real IDs back to project/brief/document/receipts/conversation. Anything not programmatically capturable — notably screenshots today — is stated as manually captured.

## Acceptance criteria

Golden path completes with no dead links; every artifact traceable to real rows; every failure path answers plainly instead of guessing; trip state consistent across both doors; Receipts shows a complete chain for each step; fresh user can complete the path unaided; 384px and desktop convey the same truth.
