# Vanta Business Documents + Contract Intelligence — Build Prep

**Status:** Report only. No implementation. No new tables, routes, migrations, edge functions, AI calls, or UI in this slice.

**Gate:** Documents Phase 1 does not start until (a) Command Center Daily Bulletin polish is confirmed and (b) Export Polish v1 (Operator + Client) is stable. Active build slice remains Export Polish v1.

**Internal name:** Business Documents + Contract Intelligence
**User-facing name:** Documents

**Plain-English promise:**
> Upload or create a business document and Vanta will explain what it is, what it means, what matters, what could go wrong, and what needs your attention.

---

## 1. Current System Audit

| Area | Key files | Verdict |
|---|---|---|
| File intake (staged upload, share target, ingest) | `src/lib/fileIntake.ts`, `src/hooks/useStagedUpload.ts`, `src/hooks/useSharedTargetIntake.ts`, `src/components/files/*`, `supabase/functions/files-ingest`, `supabase/functions/_shared/fileIntake.ts` | Reusable as-is |
| Storage buckets | existing private files bucket via `files-ingest` | Needs small extension later (sub-paths for extracted text / draft / export) |
| `ingested_files` row + project attach | `src/lib/fileIntake.ts`, `useAttachedItemIds`, `BulkAttachToProjectMenu` | Reusable as-is |
| Projects + `project_items` | `src/lib/projects.ts`, `src/pages/Projects.tsx`, `src/pages/ProjectBrief.tsx`, `src/components/projects/*` | Reusable as-is |
| Living Brief / project summaries | `src/components/projects/LivingBriefBlocks.tsx`, `ProjectBriefView.tsx`, `supabase/functions/project-summarize` | Needs small extension later (new block kinds: parties, dates, money, obligations, risks, open questions) |
| Brief exports + PDF renderer | `src/lib/briefs.ts`, `src/lib/briefTemplates.ts`, `src/components/briefs/BriefPdfDocument.tsx`, `BriefRenderer.tsx`, `BriefExportsList.tsx`, `supabase/functions/compose-brief` | Reusable as-is for envelope; new audience templates added later |
| Receipts / audit | `src/lib/fileAudit.ts`, `src/lib/receiptResolve.ts`, `src/components/audit/AuditDetailDrawer.tsx`, `audit_log` table | Reusable as-is |
| Command Center bulletin language | `src/components/cockpit/DailyBulletinCard.tsx`, `src/components/surfaces/CommandCenterSurface.tsx`, `src/lib/bulletinLanguage.ts`, `src/lib/plainLabels.ts` | Needs small extension later (document event copy) |
| Intake lifecycle + grouped captures | `src/lib/intakeLifecycle.ts`, `src/components/memory/*`, `BulkAttachToProjectMenu.tsx` | Reusable as-is |
| Conversation / Companion / voice | `src/components/companion/*`, `src/components/capture/VoiceCaptureCard.tsx`, `supabase/functions/vanta-converse`, `notes-assist` | Reusable as-is for contextual prompts; no new chat surface |
| Sherlock (risk-flag analog) | `src/components/sherlock/*`, `supabase/functions/sherlock-*` | Do not touch yet (separate lane); patterns informative for risk surfacing |
| OCR / text extraction | not present | Needs new build later (server-side extractor) |
| DOCX generation | not present | Needs new build later |
| User preferences / scope | `useUserPreferences`, `useActiveScope`, `WorkspaceProvider` | Reusable as-is |

---

## 2. Reusable Components (concrete)

- **Upload + ingest:** `useStagedUpload`, `GlobalDropZone`, `files-ingest` → produces an `ingested_files` row with extracted metadata. Documents can ride this exactly as captures do.
- **Project attach:** `AttachToProjectMenu`, `BulkAttachToProjectMenu`, `AddToProjectComposer`. Already used by captures and files; Documents can reuse without changes.
- **Living Brief blocks:** `LivingBriefBlocks` renders typed blocks via `project-summarize`. New block kinds slot in additively.
- **Brief envelope + PDF:** `compose-brief` returns a `Brief` (sections, grounding, footnotes). `BriefPdfDocument` + `BriefRenderer` + `briefTemplates.ts` render it per audience. Documents review/export is a new set of audience templates over the same shape.
- **Receipts:** `audit_log` writes via `fileAudit.ts` and resolver in `receiptResolve.ts`. Every document state change emits one event surfaced as a plain-English receipt.
- **Bulletin language:** `bulletinLanguage.ts` + `plainLabels.ts` already humanise events. New event keys for documents plug into the same translator.
- **Companion context:** `CompanionContext`, `vanta-converse`. Lets a Project / Document / Export surface carry a context-scoped conversation without introducing a new chat surface.

---

## 3. Gaps

- **Text extraction.** No OCR or PDF/DOCX-to-text in the codebase. Needed for Phase 1 review.
- **DOCX generation.** Only PDF rendering exists today (`@react-pdf/renderer`). Phase 2/4 needs DOCX.
- **Document-shaped row.** `ingested_files` carries the binary but has no slot for "this is a contract / NDA / SOW / lease", parties, status, or version chain.
- **Risk / obligation typing.** Sherlock findings target capture-level risk, not document-clause risk; a Documents-specific shape is needed (or a clearly scoped extension).
- **Approval state machine.** Drafts need a Plan→Approve→Execute envelope distinct from current intake lifecycle (proposal → drafted → user-approved → exported → stored).
- **Signature page + watermark + cover variants.** PDF renderer has audience cosmetics but no signature page, watermark, or appendix-of-sources block.
- **Bulletin copy for documents.** No keys yet in `plainLabels.ts` for document events.

---

## 4. Recommended Future Data Model

Prefer reuse. Propose new tables only where existing rows can't carry the semantics.

- **Reuse:** `ingested_files` (original binary + metadata), `project_items` (membership in a project), `brief_exports` (exported packets), `audit_log` (receipts), `projects` (owner of the document), `notes` (free-form addenda).
- **Propose new (sketch only, no SQL):**
  - `documents` — id, project_id, source_file_id (FK `ingested_files`), kind (`nda|sow|service|lease|partnership|invoice|policy|letter|other`), title, parties (jsonb), status (`uploaded|extracted|reviewed|drafting|drafted|approved|exported`), latest_version_id, created/updated.
  - `document_versions` — id, document_id, version_no, body_text, body_storage_path, source (`upload|draft|revision`), created_by, created_at.
  - `document_reviews` — id, document_id, version_id, summary, parties, dates, money_terms, obligations, missing_or_unclear, questions_to_ask, verdict, generated_at.
  - `document_risks` — id, review_id, severity (`low|medium|high`), title, plain_english, clause_ref, suggested_question.
  - `document_obligations` — id, document_id, party, what, when, conditions, source_clause_ref.
  - `document_exports` — *not new;* uses `brief_exports` with `format = "document_packet_*"` and `scope_kind = "document"`.

All new tables follow the project's standard pattern: enable RLS; GRANT to `authenticated` + `service_role` in the same migration; scope by `user_id` + active scope (`useActiveScope`).

---

## 5. Recommended Future Storage Model

Single private bucket, sub-paths keyed by document id:

```
documents/{document_id}/original.{ext}
documents/{document_id}/extracted/{version_id}.txt
documents/{document_id}/review/{review_id}.json
documents/{document_id}/draft/{version_id}.md
documents/{document_id}/export/{export_id}.pdf
documents/{document_id}/export/{export_id}.docx
documents/{document_id}/signature/{export_id}.pdf
documents/{document_id}/appendix/{export_id}.pdf
```

No bucket changes in this slice. Reuses current upload + signed-URL flow.

---

## 6. Recommended Future Edge Functions

Indicative names; not created in this slice.

- `documents-extract` — pulls text from PDF/DOCX/image, writes extracted version, emits `document.extracted`.
- `documents-review` — runs plain-English review pipeline, produces `document_reviews` + `document_risks` + `document_obligations`, emits `document.reviewed`.
- `documents-draft` — guided/conversational draft generation, writes a new `document_versions` row, emits `document.draft_created`.
- `documents-export` — composes a document packet via the existing `compose-brief` envelope or a thin wrapper; writes a `brief_exports` row with document scope; emits `document.exported`.

Significant overlap with `compose-brief` (envelope + footnotes) and `project-summarize` (living brief). Where possible, extend rather than duplicate.

---

## 7. Recommended Future UI Surfaces

No new top-level routes. Documents lives inside existing surfaces.

- **Project page → Documents tab** (list of documents attached to this project, with status).
- **Document detail sheet** with three modes: *Review*, *Draft*, *Export*. Mode tabs inside one sheet, not separate routes.
- **Capture entry point** — when a file is captured, a "Treat as document" action attaches + opens the Document detail in Review mode.
- **Project Inbox** — orphan uploads get the same "Attach to project / Treat as document" affordance already used for captures.
- **Command Center** — bulletin lines reference document state changes; tap → opens the project + document detail. No new card type.

---

## 8. Project Integration Plan

- Every document belongs to a Project.
- Orphan uploads land in Project Inbox and follow the existing attach flow.
- Project detail surfaces a Documents tab and a small count chip.
- "What changed" on the project rollup includes the latest document event in plain English.
- No document executes anything on a Project. Plan → Approve → Execute happens inside the Document detail sheet, identical to existing Vanta law.

---

## 9. Living Brief Integration Plan

`project-summarize` gains new block kinds, additive:

- **Parties** — who is involved across this project's documents.
- **Key dates** — start, end, renewal, notice windows.
- **Money terms** — fees, splits, payment cadence.
- **Obligations** — who owes what to whom and when.
- **Risks / open questions** — surfaced from `document_risks` and missing/unclear sections.

Example Living Brief line:
> Ground Stay now has one uploaded agreement requiring review. Main issues appear to be confidentiality, payment responsibilities, and ownership of platform work.

---

## 10. Command Center Integration Plan

After polish lands, documents speak in `bulletinLanguage.ts` and `plainLabels.ts` like every other system.

**Good lines:**
- New agreement added to Ground Stay.
- Ground Stay NDA review is ready.
- One contract risk needs review.
- Signature-ready NDA was exported.
- Payment terms summary saved.
- Attorney review packet created.

**Banned phrasings:**
- file upload complete
- document processed
- extraction complete
- vector index updated
- contract analysis event created
- raw event keys (`document.reviewed`, `documents-extract.ok`, etc.)

All routed through the existing humaniser. No raw env vars or internal IDs on Command Center.

---

## 11. Export / Receipt Integration Plan

**Exports** ride on `brief_exports` + the PDF renderer. New audience templates added to `briefTemplates.ts` (later, not now):

- Contract Review Brief
- Plain-English NDA Summary
- Red Flag Report
- Client Review Packet
- Signature-Ready Draft
- Attorney Handoff Packet
- Clause Summary / Obligation Summary / Payment Terms Summary
- Executive Summary
- Internal Notes Version vs Client-Facing Version

Each template defines: section order, footer note, whether raw receipts are stripped (mandatory for client/attorney/signature outputs), and whether the footnotes appendix is shown.

**Receipts.** Every state change (`uploaded`, `extracted`, `reviewed`, `risk_flagged`, `draft_created`, `approved`, `exported`) writes an `audit_log` row, surfaced in plain English through the existing receipt resolver. No silent edits. Every export logs which version was rendered with which template.

---

## 12. Voice / Type Conversation Integration Plan

Reuse `vanta-converse` + Companion. Conversation becomes contextual inside surfaces, not a separate room.

- Inside a Project: "Draft an NDA for this project."
- Inside a Document review: "Explain clause 7 in plain English."
- Inside a PDF preview: "Make this more boardroom-ready."
- Inside a risk review: "Show me what could bite me later."
- Inside an export: "Add a signature page."

Constraints:
- No new global chat surface.
- All conversational outputs land as **drafts** inside the active surface.
- Plan → Approve → Execute preserved. Capture never executes.
- Voice path piggybacks on `VoiceCaptureCard` and existing transcription.

---

## 13. Legal / Trust Guardrails

Single soft disclaimer, used verbatim:

> Vanta can help you understand and prepare, but this does not replace a licensed attorney.

Shown in: document review, contract analysis, risk report, legal draft creation, signature-ready packet, attorney review packet.

Tone:
- Warm but not chummy.
- Not scared, not law-firm cosplay.
- No exclamation marks (project voice rule).
- No jurisdiction-specific guarantee.
- No claim of legal correctness.

---

## 14. Out-of-Scope (Hard No)

Not in Phase 1, and several never:

- E-signature
- Legal filing / court filing
- Automatic sending
- Automatic execution / auto-approve
- Jurisdiction-specific legal guarantees
- Attorney impersonation / final legal advice
- Hidden / silent contract edits
- Uncontrolled template generation
- Raw legal hallucinations without review
- Objective contract risk scoring presented as legal truth
- Hidden AI edits without receipts
- Full template marketplace
- Full theme customizer

---

## 15. Recommended Phased Implementation Plan

**Phase 1 — Review Uploaded Documents.** Upload PDF/DOCX/image/screenshot → extract text → plain-English summary, parties, dates, money, obligations, risks, missing/unclear, questions, verdict → attach to Project → create review brief → export PDF → receipts. **Start here.**

**Phase 2 — Draft Basic Business Documents.** NDAs, service agreements, SOWs, simple letters, payment agreements. Guided setup first; conversational later.

**Phase 3 — Conversational Document Builder.** Voice/type setup, follow-up questions, style controls, revision loop. Uses `vanta-converse` contextually.

**Phase 4 — Premium Document Packets.** Cover page, watermark, signature page, summary, risk appendix, source appendix; DOCX output.

**Later.** Version compare, obligation tracking, renewal reminders, signature packet prep, attorney handoff packet, business template vault.

---

## 16. Readiness Gate Before Build

Documents Phase 1 starts only when all true:

1. Command Center Daily Bulletin polish confirmed complete.
2. No raw event names, raw env vars, or raw Sherlock labels leak on Command Center.
3. Export Polish v1 stable enough for credible document outputs (Operator + Client briefs shipping clean).
4. Project export round-trip works end-to-end.
5. Receipts are plain English wherever user-facing.
6. Upload / file handling stable across web + share target + mobile (384px).
7. Project attachment stable (single + bulk).
8. No major stale / dismissed clutter remaining on Command Center.

If any are false: do not start Documents Phase 1.

---

## Final Principle

This module is not a legal form builder. It is a business document command studio inside Vanta.

Say what you need. Upload what you have. Understand what you are dealing with. Revise it. Package it. Keep proof.

Vanta explains in plain English, helps prepare drafts, flags risks, organises by Project, exports cleanly, preserves receipts. Capture never executes. Plan → Approve → Execute happens only inside the platform.

---

## 17. Tooling-Layer Addendum — Cross-Check Verdict (Jun 2026)

Reviewed against `Vanta_Business_Documents_Tooling_Layer_Addendum_Audit_Prompt.pdf`.

**Verdict:** *Tooling layer partially covered.* The artifact spine ships (extracted text, drafts, exports, receipts), but the explicit "tools do the work, conversation controls them" framing is implicit in the build-prep rather than named as a layer.

### Already covered (no rebuild)
- Intake tools — `files-ingest`, `documents-extract`, `useStagedUpload`, `GlobalDropZone`.
- Understanding tools — `documents-review` (parties, dates, money, obligations, risks, plain-English summary).
- Drafting tools — `documents-draft` with guided + chat intake.
- Export tools — `compose-brief` + `BriefPdfDocument` + `documentDocxExport.ts` (PDF + DOCX).
- Project/system tools — project attach, Living Brief integration via `project-summarize`, `audit_log` receipts, Command Center humaniser.
- Conversation control — `vanta-converse`, `CompanionContext`, contextual prompts inside surfaces.
- Approvals — drafts land as `proposed` and require user approval before export; exports always land in `brief_exports`.

### Gaps to fold into existing phases (additive, no schema changes)
1. **Named tool plan before execution.** When a contextual ask resolves to a multi-step run (e.g. "review this and create a packet"), show the numbered plan and a single Approve button before any tool fires. *Folds into Sherlock/Research/Recap audit → Phase 7 Documents Integration; reuses existing Plan→Approve→Execute infra, no new tables.*
2. **Per-tool-action receipts surfacing.** Receipts already write to `audit_log`; surface them as a per-document timeline ("extracted → reviewed → drafted → exported") inside `DocumentDetailSheet`. *Phase 7.*
3. **Source appendix builder.** Optional brief-template section that lists every source the review/draft cited. Extends `briefTemplates.ts` only; no new edge function. *Phase 7.*
4. **Signature page / cover variants.** Adds two `BriefPdfDocument` page kinds; no new infra. *Phase 7, ships with Premium Document Packets.*
5. **Outside-context research per document.** Wire the Phase 3 Research suggestion chip into `DocumentDetailSheet` so a user can ask Vanta to gather outside examples for a clause or risk, with the result attached as a research-brief receipt on the document. *Already planned in Sherlock audit Phase 7; this confirms the hook.*
6. **Version compare / redline / obligation tracking / template vault / attorney handoff.** Stay parked in "Later Phases." No change.

### What stays out of scope
E-signature, legal filing, automatic sending, autonomous contract approval, attorney impersonation, hidden edits, full template marketplace, full theme customizer.

### No-build confirmation
Folding these into the existing roadmap. **No new tables, no new edge functions, no UI restructure introduced by this addendum.** Items 1–4 ship inside the already-planned Phase 7 work; item 5 reuses the Phase 3 Research chip; item 6 stays parked.
