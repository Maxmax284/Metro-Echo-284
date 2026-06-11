## Sequence

### Step 0 — Confirm polish slice passed (gate)
Re-run the real-workflow stress test against Command Center before any Export work. Pass criteria:
- No raw event names, no `suggest:*` modes, no env-var secret names anywhere on the front door.
- Memory Pulse cards show a "what happened" sub-line.
- Grouped capture cards expose "Attach to project".
- Project rollup explains hidden projects.
- Soft welcome is non-blocking; tutorial does not auto-open.
- Laundry ghost still dead; dismissed captures stay dismissed.

If anything fails → fix in place, do not start Export Polish. If clean → proceed.

### Step 1 — Export Polish v1 scope
Targets, in order: **Operator Brief**, **Client Brief**. Nothing else this slice.

Out of scope (explicit):
- No theme customizer / no per-user style controls.
- No new audiences, no new formats, no new templates beyond these two.
- No Documents / Contract Intelligence module (parked — see bottom).
- No new tables, routes, migrations, or AI calls.
- No edits to `compose-brief` payload shape.

### Step 2 — Operator Brief polish
Goal: feels like a tactical one-pager the operator actually wants to keep.

In `src/lib/briefTemplates.ts` (`internal_operator` + `operator` format path) and `src/components/briefs/BriefPdfDocument.tsx` / `BriefRenderer.tsx`:
- Tighten cover: title, scope line, date, signals hash chip. No marketing chrome.
- Section order: Overall → Next move → Decisions → Key topics → Risks → Sources.
- Translate any remaining internal labels via `plainLabels.ts` (audit events, sherlock terms) so receipts in the appendix read in plain English.
- Compact spacing; remove decorative rules that waste vertical space on mobile-printed PDFs.
- Footer: "Operator brief · {date} · {signals_hash short}".

### Step 3 — Client Brief polish
Goal: external-ready, no internal noise, no raw receipts.

- Cover page only: title, subtitle, "Prepared for" line, date. No signals hash, no audit chrome (already `showSignalsHash: false`, `footnotesAppendix: false` — verify holds end-to-end).
- Section order: Situation → Key topics → Decisions → Considerations (Risks renamed, already in template) → Next move.
- Strip any `{kind}:{id}` receipt strings from claim text before render (sanitizer pass in `BriefRenderer` + PDF).
- Soft serif title styling already in template; tighten body leading for printed feel.
- Disclaimer footer line: "Prepared with Vanta. Summary only — not a legal document."

### Step 4 — Shared QA pass
- Generate one Operator and one Client PDF from a real project.
- Convert to images, inspect every page for: overflow, jargon leaks, raw IDs, empty sections, broken footnotes.
- Verify `brief_exports` row + `brief.exported` (or `audit_packet.generated`) audit event written for both.
- Confirm both appear in `BriefExportsList` with friendly format labels.

### Step 5 — Report & stop
After Step 4: write findings into `.lovable/export-polish-v1-report.md`. Do not start Documents, OpenCanvas Phase 2, or Companion Phase 2.

---

## Re: the attachment (Vanta Business Documents + Contract Intelligence)

Read in full. It is **explicitly "do not build yet"** and the brief itself places Documents *after* (1) Command Center polish and (2) Export Polish. Action now:

- Save the brief into the repo as `.lovable/documents-contract-intelligence-design-brief.md` (verbatim, design-only).
- Add a one-line pointer in `mem://index.md` under Memories so it surfaces when Documents work eventually starts.
- No code, no tables, no routes, no AI calls. Park.

When Documents eventually enters build, the brief's own Phase 1 recommendation holds: start with **Review Uploaded Documents**, not drafting.

---

## Technical notes

- All Export work lives in: `src/lib/briefTemplates.ts`, `src/lib/briefs.ts` (no shape changes), `src/components/briefs/BriefPdfDocument.tsx`, `BriefRenderer.tsx`, `BriefExportsList.tsx`, and `src/lib/plainLabels.ts` (translator additions only).
- No changes to `compose-brief` edge function in this slice — polish is render-layer only.
- Storage path unchanged: `{user_id}/briefs/{export_id}.pdf` on `memory-uploads` bucket.