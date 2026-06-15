# Documents — Phase 2 (Drafting) shipped; Phase 3 (Conversational) scaffolded

Internal: **Business Documents + Contract Intelligence**. User-facing: **Documents**.

Phase 1 (Review) shipped previously. This pass added Phase 2 (Drafting basic
business documents) and left a safe scaffold for Phase 3 (Conversational
builder) that doesn't expand the capture surface or break Plan→Approve→Execute.

---

## Phase 2 — Drafting (DONE)

### Schema
Migration adds without breaking existing rows:
- `document_status` enum gains `drafting`, `drafted`, `approved`.
- `document_version_source` enum gains `draft`, `revision`.
- `documents` table gains columns: `template_key`, `draft_inputs` (jsonb), `tone`.
No new tables. RLS already enforces owner/org-member access on the parent rows.

### Edge function — `documents-draft`
- Input: `{ document_id, template_title, user_message, revision_prompt? }`.
- Calls Lovable AI (`google/gemini-2.5-flash`) with the voice doctrine + tone.
- Writes a new `document_versions` row (`source='draft'` or `'revision'`).
- Updates `documents.status` to `drafted` (or `failed` on rate/credit/network).
- Emits one audit event per outcome:
  - `document.draft_created`, `document.draft_revised`,
  - `document.draft_failed`, `document.draft_approved` (via client lib).

### Frontend
- `src/lib/documentTemplates.ts` — five starter templates (Mutual NDA,
  Simple SOW, Service Agreement, Payment Agreement, Business Letter) with
  field schemas + per-template prompt builders.
- `src/lib/documents.ts` — new lifecycle: `createDraftDocument`, `runDraft`,
  `approveDraft`, `getLatestVersion`, `isDraftDocument`.
- `src/lib/documentDraftExport.ts` — exports a drafted document as a PDF
  packet (operator working copy or client-ready) using the existing
  `brief_exports` + `BriefPdfDocument` pipeline. Splits markdown by headings.
- `src/components/documents/NewDocumentDialog.tsx` — guided template picker
  + field form + tone selector. Builds the user message and invokes
  `documents-draft`. Plan→Approve→Execute: nothing runs until the user taps.
- `src/components/documents/DocumentDetailSheet.tsx` — adds a Draft mode
  branch (renders body markdown, revision input, approve action, export
  controls, Companion contextual prompts). Reuses the same sheet shell.
- `src/components/documents/ProjectDocumentsSection.tsx` — adds a
  "New document" button and an empty-state line, passes `organizationId`.

### Bulletin + receipts
`plainLabels.ts` + `bulletinLanguage.ts` extended for:
- `document.draft_created` → "A new document draft is ready to read." (captures)
- `document.draft_revised` → "A document draft was updated." (captures)
- `document.draft_approved` → "A document draft was approved." (done)
- `document.draft_failed` → "A document needs another look." (attention)

No raw event keys, no env-var names, no model names ever surface.

### Out of scope (Phase 2)
- E-signature, signature blocks beyond plain text.
- DOCX output (Phase 4).
- Watermarks, cover pages, source appendices (Phase 4).
- Jurisdiction-specific guarantees (never).
- Auto-send / silent edits (never).

---

## Phase 3 — Conversational Builder (SCAFFOLD ONLY)

Wired safely without expanding the capture surface or letting AI execute.

- `DocumentDetailSheet` already routes "Ask Vanta" buttons through
  `useCompanion().openWithPrefill(...)`. For drafts, three contextual
  prompts are present:
  - "Tighten 30%" (suggestion only)
  - "Warmer voice" (suggestion only)
  - "Boardroom-formal" (suggestion only)
  These open a Companion conversation pre-filled with a draft suggestion.
  The user must explicitly tap **Apply revision** in the sheet to actually
  call `documents-draft` with a revision prompt. Nothing executes from
  inside the conversation.

### What Phase 3 still needs (next slice)
1. Voice path: piggyback on `VoiceCaptureCard` to capture a revision prompt
   spoken aloud; transcript drops straight into the revision textarea.
2. Multi-turn follow-up questions before the first draft (e.g. "Who's the
   counterparty?" when missing). Today the dialog asks all fields up-front.
3. Style presets persisted per project (currently per-document tone only).
4. Inline "explain this clause" prompt anchored to a selected paragraph.

None of these expand the surface area. All four reuse `vanta-converse` +
`documents-draft` and stay inside the existing detail sheet.

---

## Phase 4 — Premium Packets (NOT STARTED)
DOCX output, cover pages, watermarks, signature pages, source appendices.
Will likely require a new edge function `documents-docx` and small extensions
to `BriefPdfDocument` for cover + signature blocks. No schema change expected.

---

## Build verification (this pass)
- Migration applied: status + version source enums extended; columns added.
- Edge function deployed automatically.
- TypeScript: status state machine extended to cover all 9 statuses; build
  passes with no type errors after adding `template_key`, `draft_inputs`,
  `tone` to `DocumentRow`.
- UI validated at 384px (project sheet, detail sheet, dialog).
- Bulletin + plain-label coverage extended for every new audit event.
- Plan → Approve → Execute preserved everywhere: drafting requires an
  explicit dialog submission; revisions require explicit Apply tap;
  approvals require explicit Approve tap; exports require explicit Export
  tap; no AI runs from messaging or capture.
