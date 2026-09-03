# Cross-reference: multi-source investigation and artifact building

Attach several sources, say "cross-reference these", get a verified result you can correct, then a polished PDF. Domain-agnostic: fight cards, contracts vs invoices, receipts vs ledgers, reports, applications, inventories.

## What already exists (reuse, do not rebuild)

- **One Ask brain, no drift.** The global widget renders the same `ConversationSurface` as the Ask room, which calls the same `vanta-converse` function. Both surfaces get this capability for free if it lives in `vanta-converse` + shared components.
- **Routing already decides "what should happen"**: `_shared/orchestration/capabilityRouter.ts` already has `comparison`, `source_verification`, `ocr`, `document_extraction`, `sherlock` families and a `min_confidence` gate.
- **Reading files already works once**: `_shared/pageRead.ts` (Gemini OCR), `_shared/fileIntake.ts` (doc-type classifier, sensitive detection), `files-ingest`, `memory-uploads` storage, `ingested_files` rows. Attachments in Ask are already ingested files, not raw bytes.
- **Polished PDFs already work**: `@react-pdf/renderer` + `BriefPdfDocument`, `brief_exports` rows, storage upload and audit events via `src/lib/briefs.ts`. `docx` is available too.
- **Sherlock is already a room and a voice**: findings, evidence drawer, "Why this triggered", feedback. Confidence and provenance language exists.

## Naming

Keep **Sherlock** as the internal capability and the *noticing* room. The multi-source job is user-facing **"Cross-reference"** — a verb the user already types. One thin line on the result card credits Sherlock. No new room, no new tab.

## The flow

```text
attach 2+ sources -> Vanta says "looks like a multi-source job"
  -> Cross-reference chip (or just ask for it)
  -> read each source once (cached by file hash)
  -> pull claims with provenance (file / page / region)
  -> match records across sources (entity resolution)
  -> matrix: agrees / conflicts / missing / unreadable / duplicate / stale / calculated
  -> REVIEW: only real conflicts, user fixes or picks a winner
  -> choose an output shape + style -> PDF/DOCX in Receipts
```

## Data model (new, small)

- `cross_ref_cases` — case per job: title, purpose ("announcer sheet", "reconcile"), scope + `organization_id`, recipe id, status, `thread_id`, timestamps.
- `case_sources` — one row per attached file: `ingested_file_id`, content hash, role (`master` / `supporting` / `unknown`), authority rank, page count, extraction status.
- `case_claims` — normalized evidence: `record_key`, `field`, `value_text`, `value_number`, `unit`, `certainty` (`verified` / `inferred` / `uncertain`), `source_id`, `page`, `excerpt`, `bbox` (nullable), `sensitive` flag.
- `case_records` — resolved subjects (person/item/event): display name, match confidence, `member_claim_ids`, `confirmed_by_user`.
- `case_conflicts` — field-level disagreement: record, field, competing claim ids, kind, `resolution` (`pending` / `chose_claim` / `manual_value` / `left_open`), resolved value, who resolved.
- Reuse `brief_exports` for the artifact; reuse `audit_log` for every resolution and export. All tables user-scoped RLS + GRANTs, scope-filtered like everything else.

Nothing is auto-applied to projects, commitments or actions. A case can *offer* to file its result; the user taps.

## Authority and honesty rules

- Authority is **inferred then shown**: "Fight card is authoritative for names and bout order. Registration sheets are authoritative for age, height, weight." Editable in one tap per source; per-field overrides possible from a conflict row.
- Certainty is never softened: `verified` (read cleanly from a source), `inferred` (derived or matched), `uncertain` (unreadable/ambiguous), `conflicting`. Unreadable text is shown as unreadable with a crop of the source — never guessed.
- Entity matching below threshold surfaces as "Is this the same person?" instead of silently merging.
- Derived values (weight differences, totals, date gaps) are computed in deterministic TypeScript on the server, never by the model, and are labelled "calculated".

## Output field selection (privacy)

Each output shape declares the fields it wants. Phone, address, payment, insurance, ID numbers are captured as claims but excluded from artifacts by default, marked "held back" in the review step, and only included if the user ticks them. Existing `_shared/sensitive.ts` supplies detection.

## Artifact composer and style

Extend the brief pipeline rather than a second renderer: add layout-specific section kinds (`matrix`, `field_table`, `roster_card`, `conflict_log`, `calculation`) to `BriefSection` and matching components in `BriefPdfDocument`. Output shapes: **announcer/roster sheet, reconciliation report, comparison dossier, clean final form, audit report, executive summary, table-heavy report**. Style layer: Vanta street-tech default, a plain "hand it to an outsider" variant, optional accent/logo carried from the master source; picked in review, remembered per recipe.

## Surfaces

- **Composer (both surfaces)**: with 2+ readable attachments, an inline line appears — "2 photos and a PDF. Cross-reference them?" — plus a `Cross-reference` chip. One chip, no menu.
- **Result card in the thread** (`StructuredResponse` block): counts (records, agreements, conflicts, unreadable), the top three conflicts, `Review`, `Build the PDF`, `Add another source`.
- **Review sheet**: records list, conflict rows with both readings and their source crop, choose/type/leave-open, then output shape + style + held-back fields. Mobile-first, 384px, 44px targets, one conflict fully readable at a time.
- **Widget vs room**: same case, same components. The widget shows progress and the result card; the matrix and PDF preview push the user to Ask with "Needs more room" (existing `promoteToAskRoom`).

## Continuity, cost, tools

- The case is a row, not component state: leave, come back, add a source, regenerate. Threads link to cases so "same treatment" resolves to the last case.
- Extraction cached by content hash on `ingested_files`; re-runs only touch new or changed sources. Vision only for image/scan pages; text PDFs go through text extraction. Matching and math are code, not model calls.
- New server work: `crossref-run` (read + claims + match + matrix), `crossref-compose` (artifact). Both thin wrappers over existing shared modules; `capabilityRouter` gains a `cross_reference` family so Ask detects the job.

## Recipes

A recipe is saved output preferences only — field list, authority defaults, output shape, style. "Fight card" becomes a recipe after the first real run ("Same as last time?"). Recipes never change the engine and never skip review.

## Phases

1. Detection + case store + read/claims with provenance, plain result card (no PDF yet).
2. Entity resolution + conflict matrix + review sheet with corrections and calculated values.
3. Artifact composer: new section kinds, three output shapes, style picker, export to Receipts.
4. Remaining output shapes, recipes, "add another source", widget→room hand-off polish.

## Risks

- OCR of handwriting will be the weak link — the fix is honest `uncertain` marking and the source crop in review, not better prompting.
- Matrix UI can turn into forensic software; the guard is that only unresolved conflicts are ever shown by default.
- Model-written arithmetic; guarded by server-side calculation only.
- Scope leakage across workspaces; every query goes through `applyScope`.

## Not building

No new room or nav entry. No second chat implementation for the widget. No auto-execution, auto-filing or auto-send of any artifact. No separate OCR/PDF stack. No confidence percentages shown as science. No case sharing or collaboration yet. No spreadsheet editor.
