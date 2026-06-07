# Slice 5 — Overall Project Summary + Export Experience

Extends the existing Living Brief + Briefs/Exports pipeline. No new engines, no new surfaces, no architecture changes. Sherlock stays quiet in the background.

## 1. Overall Summary block (Living Brief)

`**supabase/functions/project-summarize/index.ts**`

- Bump `BRIEF_SCHEMA` to add `overall_summary` as the FIRST required field: `{ text: string (≤900 chars), citations: string[] (≤8) }`. Schema version stays 2.
- Pull Sherlock signals quietly into the prompt input as a separate context block:
  - Read `sherlock_findings_cache` rows + the attached `finding` items already wired in.
  - Read recent `audit_log` rows (last ~25) for this project (timeline events).
  - Read project's last 2 `brief_exports` for continuity ("what changed since last brief").
  - Inject these as `BACKGROUND PATTERNS:` lines (no UI exposure), instructing the model to use them to detect repetition, contradictions, themes — but never name "Sherlock"/"findings"/"signals" in output.
- New prompt rules for `overall_summary`:
  - One coherent paragraph that explains what all attached material means together.
  - Synthesis voice ("Ground Stay is currently in a cleanup phase…"), not enumeration.
  - Must cite ≥3 distinct ref keys spanning at least 2 item kinds when material allows.
  - Banned phrases extended: "Sherlock", "the system detected", "based on the data", "we have N notes".
  - Preferred phrasings: "Vanta noticed…", "Several items point to…", "The main pattern is…".
- `buildPlainText`: prepend `Overall: <text>` so the mirrored `projects.summary` and the `brief_exports` plain text lead with it.

`**src/components/projects/LivingBriefBlocks.tsx**`

- Add `overall_summary?: { text?: string; citations?: string[] }` to `StructuredBrief.blocks`.
- Render as the first block above Situation, with a distinct visual treatment (slightly larger leading, accent border-left, citation chips inline). Heading: "Overall summary".
- `isV2` detection includes `overall_summary.text`.

## 2. Project-scoped export flow

`**src/lib/briefs.ts**`

- `composeBrief` already accepts `scope_kind`. Add `"project"` plumbing end-to-end (params, `composeBriefArgs`, edge call).
- Add `audience` field to `BriefExportRow.brief.grounding` and to the `composeBrief` payload: `"me" | "internal_operator" | "client" | "audit" | "implementation" | "presentation"`.

`**supabase/functions/compose-brief/index.ts**`

- Accept `scope_kind: "project"` + `project_id` + `audience`.
- New snapshot builder `buildProjectSnapshot(supabase, project_id)`:
  - Reuses the same query set as `project-summarize` (notes/captures/files/findings/commitments/actions via `project_items`).
  - Pulls the latest `projects.brief_structured` so the composer doesn't re-summarize — it packages.
  - Includes recent project audit + last 2 exports.
- Add audience-aware tone overlay applied on top of `FORMAT_TONE`:
  - `me`: direct, terse, operational, no fluff.
  - `internal_operator`: clean operational summary, easy to act on (default for Nikki).
  - `client`: polished, strips internal/private signals.
  - `audit`: receipts-first, timestamps emphasized.
  - `implementation`: requirements/decisions/risks/next steps emphasized.
  - `presentation`: tight one-pager voice.
- For project scope, seed sections from the Living Brief's `overall_summary` + `situation` + `key_topics` + `decisions` + `risks` + `next_move` rather than reinventing.

`**src/components/briefs/BriefComposerSheet.tsx**`

- Add `defaultScope: "system" | "entity" | "project"` and `projectId` props.
- New "Audience" picker row (6 chips) above Format, with helper subtitle: "Same project, different packaging."
- Plain helper copy under the action row when scope is project:
  > "PDF will be saved to this project and visible under Saved exports, Briefs, and Receipts."
- After successful export: toast "Saved to &nbsp; → Saved exports."

`**src/components/projects/ProjectBriefView.tsx**`

- Add a "Create export" button next to Canvas in the header (only when `structured` exists or attached items > 0).
- Opens `BriefComposerSheet` with `defaultScope="project"`, `projectId`, `defaultFormat="operator"`, `entityLabel={project.title}`.
- Rename "Past briefs" section to "Saved exports" and keep it backed by `BriefExportsList` with `projectId`. Keep the existing draft/PDF split copy from Slice 4.

## 3. PDF rendering uses the Overall Summary

`**src/components/briefs/BriefPdfDocument.tsx**`

- When a brief carries `grounding.structured` (project scope), render in this order on the document:
  1. Title page (existing) — show audience as kicker chip ("For client", "For audit", …).
  2. Overall summary (new, accent block, large body text).
  3. Situation paragraph.
  4. Key topics (themed cards).
  5. Decisions box.
  6. Risks / questions list.
  7. Next move (existing decision-box treatment).
  8. Sources appendix (existing footnotes pipeline, now fed by `ref_index`).
- Non-project briefs (system/entity) fall through to existing renderer untouched.

## 4. Out of scope (called out so we don't drift)

- No Canvas snapshot embedded in PDF yet — leave a `// TODO: canvas snapshot` hook in the PDF renderer where the section would slot in.
- No theme/accent-color customizer, no include/exclude toggles, no audio TTS for project scope (existing audio_script path stays as-is).
- No new tables. No DB migration. No Sherlock UI changes. No new routes.
- `vantaVoice.ts` untouched.

## 5. Files touched

```
supabase/functions/project-summarize/index.ts   (+ overall_summary, background patterns)
supabase/functions/compose-brief/index.ts       (+ project scope, audience)
src/lib/briefs.ts                                (+ audience field, project plumbing)
src/components/projects/LivingBriefBlocks.tsx   (+ Overall summary block)
src/components/projects/ProjectBriefView.tsx    (+ Create export button, copy)
src/components/briefs/BriefComposerSheet.tsx    (+ audience picker, project scope, destination copy)
src/components/briefs/BriefPdfDocument.tsx      (+ structured-project layout, audience kicker)
```

## 6. Acceptance check (Ground Stay)

1. User taps Summarize → Living Brief opens with "Overall summary" paragraph first, explaining the cleanup phase + topics + Lamai Global thread together (not item-by-item).
2. Sherlock-derived patterns influence wording but never appear by name.
3. User taps "Create export" inside the project → composer opens pre-scoped to Ground Stay, audience picker visible, destination copy shown.
4. Approve & export → PDF leads with Overall summary, audience tag on cover, sections in spec order, source footnotes intact.
5. Export appears under Project → Saved exports, plus Briefs surface, plus Receipts (audit_log) — confirmed by single `brief_exports` row + `brief.exported` audit event.

&nbsp;

Approved.

Proceed with Slice 5 exactly as planned.

No architecture changes.

No new engines.

No new surfaces.

No new tables.

No Sherlock UI changes.

No Canvas snapshot yet.

No export customizer yet.

Focus only on:

1. Adding Overall Summary as the first Living Brief block.

2. Quietly feeding Sherlock/project patterns into project-summarize as background context.

3. Adding project-scoped export flow.

4. Adding audience selection to export.

5. Making PDFs lead with the Overall Summary.

6. Making export destination clear:

   “PDF will be saved to this project and visible under Saved exports, Briefs, and Receipts.”

Approved Living Brief order:

- Overall Summary

- Situation

- Key Topics

- Decisions / Known Requirements

- Risks / Questions

- Next Move

- Sources / Receipts

Important rule:

The Overall Summary must explain what all attached project material means together.

It should not list notes, files, findings, or captures one by one.

For Ground Stay, the target should sound like:

“Ground Stay is currently in a cleanup phase around booking operations. The attached material points to connected issues around calendar availability, booking fee controls, payment/package logic, deposit confirmation, and unit visibility. The Lamai Global contact-page feedback is separate but related to reducing friction for guests, fighters, and clients trying to reach the business directly.”

Sherlock should stay quiet.

Use Sherlock-derived patterns to identify themes, contradictions, risks, and repeated topics, but never expose “Sherlock detected” or “the system found” in the user-facing summary.

Project export flow is approved:

Project

→ Living Brief

→ Create export

→ Choose audience

→ Choose format

→ Preview

→ Approve

→ Saved exports

→ Briefs

→ Receipts

Proceed with the listed touched files only.