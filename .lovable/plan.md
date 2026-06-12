# Business Documents + Contract Intelligence — Build Prep (report only)

This is a readiness + architecture-map pass. No tables, routes, edge functions, AI calls, or UI are added. Export Polish v1 (Operator / Client briefs) stays the active build slice; Documents implementation does not start until both Command Center polish and Export Polish gates pass.

## Deliverable

Single markdown report at:

```
.lovable/business-documents-contract-intelligence-build-prep.md
```

Optional PDF mirror generated from the markdown:

```
/mnt/documents/vanta-business-documents-contract-intelligence-build-prep.pdf
```

Both are documentation artifacts. No app code is touched in this slice.

## Audit pass before writing

Quick read-only sweep across the current codebase to ground every claim in the report. Touch only these areas; do not modify them:

- File intake & storage — `src/lib/fileIntake.ts`, `supabase/functions/_shared/fileIntake.ts`, `supabase/functions/files-ingest/index.ts`, `src/components/files/*`, `src/hooks/useStagedUpload.ts`
- Projects + Living Brief — `src/lib/projects.ts`, `src/components/projects/*`, `src/pages/ProjectBrief.tsx`, `supabase/functions/project-summarize/index.ts`
- Briefs / exports / PDF — `src/lib/briefs.ts`, `src/lib/briefTemplates.ts`, `src/components/briefs/*`, `supabase/functions/compose-brief/index.ts`
- Command Center bulletin — `src/components/cockpit/DailyBulletinCard.tsx`, `src/components/surfaces/CommandCenterSurface.tsx`, `src/lib/bulletinLanguage.ts`, `src/lib/plainLabels.ts`
- Receipts / audit — `src/lib/fileAudit.ts`, `src/components/audit/AuditDetailDrawer.tsx`, `src/lib/receiptResolve.ts`
- Conversation / voice — `src/components/companion/*`, `src/components/capture/VoiceCaptureCard.tsx`, `supabase/functions/vanta-converse/index.ts`
- Sherlock (risk-flag analog) — `src/components/sherlock/*`, `supabase/functions/sherlock-*`
- Intake lifecycle + grouped captures — `src/lib/intakeLifecycle.ts`, `src/components/memory/*`, `src/components/projects/BulkAttachToProjectMenu.tsx`

For each system the report tags it: **Reusable as-is / Needs small extension / Needs new build / Do not touch yet.**

## Report structure

The markdown follows the 16-section deliverable spec from the brief, in this order:

1. Current system audit (per-area table with the four tags above)
2. Reusable components (concrete file/function references)
3. Gaps (what's missing for Documents to land cleanly)
4. Recommended future data model — prefer reuse of `ingested_files`, `project_items`, `brief_exports`, `audit_log`; only propose new tables (`documents`, `document_reviews`, `document_risks`, `document_obligations`, `document_versions`) where existing rows can't carry the semantics. No SQL, just shape sketches.
5. Recommended future storage model — original file, extracted text, review output, generated draft, exported PDF/DOCX, signature page, source appendix; mapped to current bucket layout.
6. Recommended future edge functions — `documents-extract`, `documents-review`, `documents-draft`, `documents-export` (names indicative). Note overlap with `compose-brief` and `project-summarize`.
7. Recommended future UI surfaces — Project → Documents tab, Document detail (Review / Draft / Export), upload entry from Capture and Project Inbox. No new top-level routes.
8. Project integration plan — every document belongs to a Project; orphan documents land in Project Inbox for attachment, identical to current capture flow.
9. Living Brief integration plan — review output emits living-brief blocks (parties, dates, money terms, obligations, risks, open questions) via the existing block system.
10. Command Center integration plan — bulletin lines in plain English ("Ground Stay NDA review is ready", "One contract risk needs review"). Routed through `bulletinLanguage.ts` / `plainLabels.ts`. Banned phrasings listed.
11. Export / Receipt integration plan — Document exports ride on `brief_exports` + PDF renderer with new audience templates in `briefTemplates.ts` (Contract Review Brief, Red Flag Report, Client Review Packet, Signature-Ready Draft, Attorney Handoff Packet). Every state change writes an `audit_log` row surfaced as a plain-English receipt.
12. Voice / type conversation integration plan — reuse `vanta-converse` + Companion context; conversation becomes contextual inside Project / Document / Export surfaces. No new chat surface. Plan→Approve→Execute preserved.
13. Legal / trust guardrails — single soft disclaimer string, where it appears, the Hard No list (no e-sign, no filing, no auto-send, no silent edits, no objective risk scoring, no attorney impersonation).
14. Out-of-scope list — mirrors the Hard No + "not in Phase 1" items.
15. Recommended phased implementation plan — Phase 1 Review → Phase 2 Draft basics → Phase 3 Conversational builder → Phase 4 Premium packets → Later (versions, obligations, renewals, attorney handoff, template vault).
16. Readiness gate before build — explicit checklist: Command Center polish confirmed, no raw event/env/Sherlock labels, Export Polish v1 stable, project export round-trip green, receipts plain English, upload + project attach stable, no stale/dismissed clutter.

## Final principle (stated in the doc)

Documents is not a legal form builder. It is a business document command studio inside Vanta: explain in plain English, prepare drafts, flag risks, organize by Project, export cleanly, preserve receipts. Capture never executes. Plan → Approve → Execute always happens inside the platform.

## What this slice will NOT do

- No new tables, routes, migrations, edge functions, or AI calls.
- No UI changes.
- No changes to `compose-brief` shape.
- No start of Documents Phase 1.
- Export Polish v1 (Operator + Client) remains the active build slice.

## Technical notes

- Markdown is hand-authored from the audit above; no generated content from runtime.
- PDF mirror generated with a small one-off Python/ReportLab or pandoc-style script writing to `/mnt/documents/`; script lives in `/tmp/` and is not committed.
- Memory: update `mem://documents/design-brief-pointer` to also reference the new build-prep doc; no other memory changes.
