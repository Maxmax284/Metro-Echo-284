# Documents Phase 1 — Review Uploaded Documents

User-facing name: **Documents**. Internal: Business Documents + Contract Intelligence.

Promise: Upload a business document → Vanta explains what it is, what it means, what matters, what could go wrong, what needs your attention. Attach to a project. Export a clean review PDF. Every step leaves a receipt.

Phase 1 is **review only** — no drafting, no signatures, no auto-send. Drafting + DOCX come in later phases.

---

## 1. Data model (new migration)

Five new tables in `public`, all RLS-enabled, scoped by `user_id` + active scope. Reuses `ingested_files` for the binary and `audit_log` for receipts.

- `documents` — id, user_id, organization_id (nullable, for workspace scope), project_id, source_file_id (FK `ingested_files`), kind enum (`nda|sow|service|lease|partnership|invoice|policy|letter|other|unknown`), title, parties jsonb, status enum (`uploaded|extracting|extracted|reviewing|reviewed|failed`), latest_review_id (nullable), created_at, updated_at.
- `document_versions` — id, document_id, version_no, body_text, body_storage_path (nullable), source enum (`upload|extraction`), created_at. Phase 1 writes one row per extraction.
- `document_reviews` — id, document_id, version_id, summary, parties jsonb, key_dates jsonb, money_terms jsonb, obligations jsonb, missing_or_unclear jsonb, questions_to_ask jsonb, verdict text, model text, generated_at.
- `document_risks` — id, review_id, document_id, severity enum (`low|medium|high`), title, plain_english, clause_ref text, suggested_question.
- `document_obligations` — id, review_id, document_id, party, what, when_text, conditions, source_clause_ref.

Every CREATE TABLE followed by `GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated; GRANT ALL ... TO service_role;` then RLS enable + policies scoped by `auth.uid()` (and org membership via `is_org_member` when `organization_id` set).

Storage: reuse the existing `memory-uploads` bucket (no new buckets in Phase 1). Extracted text lives in `document_versions.body_text` directly — fast, queryable, no extra signed-URL hops.

## 2. Edge functions (two new)

- `documents-extract` — input `{ document_id }`. Loads the source `ingested_files` row, downloads from storage, extracts text (PDF via `pdf.js` / DOCX via `unzipit` + XML parse / image via existing OCR path on `files-ingest`). Writes `document_versions` row, flips `documents.status` from `uploaded` → `extracted` (or `failed`). Emits `document.extracted` to `audit_log`.
- `documents-review` — input `{ document_id, version_id? }`. Calls Lovable AI (default `google/gemini-2.5-flash`) with the doctrine-correct system prompt: warm, plain English, no legal cosplay, surface risks + missing items + questions to ask. Writes `document_reviews` + `document_risks` + `document_obligations`. Flips status to `reviewed`, sets `latest_review_id`. Emits `document.reviewed` and (per risk) `document.risk_flagged`.

Both validate JWT in-code, use the shared `apiGuard`, and rate-limit via `rate_limit_hit`.

## 3. Bulletin + receipts language

Extend `src/lib/plainLabels.ts` + `src/lib/bulletinLanguage.ts`:

- `document.uploaded` → "New agreement added to {project}."
- `document.extracted` → "{title} is ready to review."
- `document.reviewed` → "{title} review is ready."
- `document.risk_flagged` (high) → "One contract risk needs review on {title}."
- `document.exported` → "Review packet exported for {title}."

No raw event keys, no env-var names, no model names surface in user-facing copy.

## 4. UI surfaces (no new routes)

- **Project page → Documents tab** (`src/pages/ProjectBrief.tsx` / `ProjectBriefView.tsx`): list documents attached to this project with status chip + "Open" / "Review now" buttons.
- **Document detail sheet** (`src/components/documents/DocumentDetailSheet.tsx`, new): Review mode only in Phase 1. Sections — Summary, Parties, Key Dates, Money Terms, Obligations, Risks (severity-coloured), Missing or Unclear, Questions to Ask, Verdict, Sources (clause refs). Sticky footer: Export Review · View Receipts · Mark Reviewed.
- **Capture / File aftermath** (`src/components/files/FileAftermathTray.tsx`): add a "Treat as document" action on any uploaded PDF/DOCX/image. Triggers `documents` row create + `documents-extract` invoke.
- **Project Inbox** (`src/components/projects/ProjectInbox.tsx`): same "Treat as document" affordance on orphan uploads.
- **Command Center bulletin** (`DailyBulletinCard.tsx`): naturally picks up the new event copy via `bulletinLanguage.ts` — no card changes needed.

Mobile-first at 384px. Big tap targets. Single soft disclaimer at the bottom of every review surface and exported PDF:
> Vanta can help you understand and prepare, but this does not replace a licensed attorney.

## 5. Export integration

Reuses `brief_exports` + `BriefPdfDocument`. New audience template in `src/lib/briefTemplates.ts`:

- `document_review` (operator) — full sections, includes risk severity + clause refs + source appendix.
- `document_review_client` (client) — sanitised, no internal IDs/receipts, disclaimer footer.

`compose-brief` extended with a `scope: { kind: "document", document_id }` branch that hydrates from `document_reviews` + `document_risks` + `document_obligations` instead of project items.

## 6. Companion contextual prompts

Inside a Document detail, the existing Companion picks up a `documentContext` from `CompanionContext` and offers (as drafts only — no execution):
- "Explain this risk in plain English"
- "What should I ask before signing?"
- "Summarise the money terms"

No new chat surface. Plan → Approve → Execute preserved.

## 7. Out of scope (hard no — Phase 1)

E-signature · auto-send · drafting · DOCX output · jurisdiction-specific guarantees · attorney impersonation · silent edits · objective risk scoring presented as legal truth.

---

## Build order (single pass)

1. Migration: 5 tables + GRANTs + RLS + policies.
2. Edge functions: `documents-extract`, `documents-review`.
3. Frontend lib: `src/lib/documents.ts` (CRUD + invoke wrappers), types in `src/lib/documentsTypes.ts`.
4. UI: `DocumentDetailSheet`, Documents tab in project, "Treat as document" actions in file aftermath + project inbox.
5. Bulletin + receipts: extend `plainLabels.ts` + `bulletinLanguage.ts`.
6. Export: extend `briefTemplates.ts` + `compose-brief` for document scope.
7. Companion contextual prompts.
8. QA pass: upload a real PDF → extract → review → export both audiences → confirm bulletin + receipts read clean at 384px.

## Technical notes

- Text extraction in Phase 1 leans on `pdfjs-dist` (PDF), inline XML unzip (DOCX), and the existing OCR shim in `files-ingest` (images). All server-side in `documents-extract`.
- Lovable AI: default `google/gemini-2.5-flash`; on 429/402 the function returns a soft `extraction_failed`/`review_failed` status with a plain-English message — never a raw error code in the UI.
- All `audit_log` inserts use the existing helper pattern from `fileAudit.ts` so the receipt resolver picks them up automatically.
- Status state machine enforced in `documents.ts` (mirrors `intakeLifecycle.ts` style) to prevent invalid transitions.
