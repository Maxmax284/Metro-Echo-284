# Slice 4 — Living Brief language & situation-summary overhaul

No architecture changes. We're rewriting how the project Living Brief is generated, structured, and presented so it reads like an operations coordinator, not a record log. We're also clarifying the Past Briefs empty states.

## 1. New Living Brief shape

Replace the current 5-block schema (`where_it_stands`, `what_moved`, `who_waiting`, `open_questions`, `next_move`) with a 6-section operational structure. Sources stay as citation chips, never as standalone bullets.

New `brief_structured.blocks`:


| Section                        | Field                                                                 | Notes                                                                                                                          |
| ------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Situation                      | `situation.text` (string, ≤700 chars)                                 | Plain-English paragraph: what is going on across all attached items, written as one coherent picture, not a list of notes.     |
| Key Topics                     | `key_topics.themes[]` → `{ title, summary, citations[] }` (≤6 themes) | Each theme groups related captures/notes/files/findings. Title is short (e.g. "Booking & Payments"). Summary is 1–2 sentences. |
| Decisions / Known Requirements | `decisions.bullets[]` → `{ text, citations[] }` (≤6)                  | Only things that sound settled. Stated as facts, not "the user said".                                                          |
| Risks / Questions              | `risks.bullets[]` → `{ text, citations[] }` (≤6)                      | Real unresolved items, including Sherlock findings folded in silently (don't name Sherlock in prose).                          |
| Next Move                      | `next_move.text` + `next_move.citations[]`                            | One concrete operational step.                                                                                                 |
| Sources                        | derived from `ref_index`                                              | Already exists; renderer keeps chips.                                                                                          |


`version` bumps to `2`. Renderer keeps backwards compat: if `version !== 2` or new sections are missing but old `where_it_stands` etc. exist, fall back to the old layout so existing briefs still render until re-summarized.

## 2. Edge function: `supabase/functions/project-summarize/index.ts`

- Replace `BRIEF_SCHEMA` with the v2 schema above (strict JSON schema, `additionalProperties: false`).
- Rewrite the prompt:
  - Voice rules: plain English, operational, calm, useful. Banned phrases list: "filed", "notes have been captured", "items have been formally recorded", "database", "record".
  - Summarize **situations, not objects**. Do not enumerate captures; synthesize them.
  - Group related items into 2–6 themes before writing. A theme must cover ≥2 items unless a single item is clearly its own topic.
  - Pull "Decisions" only from items that read as settled (decision-intent digests, explicit statements).
  - Pull "Risks / Questions" from open questions, ambiguity in captures, and Sherlock findings with `status` open — but never mention Sherlock by name in prose.
  - "Next Move" is one concrete action grounded in the material.
  - Citations are required on every theme/bullet/next-move using the same `kind:id8` ref keys we already generate.
- Keep the existing lazy-digest pass and ref-building pipeline (no architecture change).
- Update `buildPlainText(structured)` to render the new sections in order: Situation paragraph, Key Topics (theme: summary), Decisions, Risks / Questions, Next Move. This feeds the `projects.summary` textarea and any non-rich consumers.
- `brief_exports` insert is unchanged in shape, but `brief.grounding.structured` now carries v2.

## 3. Renderer: `src/components/projects/LivingBriefBlocks.tsx`

- Extend `StructuredBrief.blocks` type with the new sections; keep old fields optional for back-compat.
- Add render blocks in order: Situation (paragraph, no bullet dot), Key Topics (each theme as a small grouped block: bold title, summary line, citation chips inline), Decisions, Risks / Questions, Next Move.
- Reuse `CitationChips` and `jumpTo` exactly as today.
- If `blocks.situation` is missing but legacy `where_it_stands` exists, render legacy layout (one fallback path, no duplication).
- Drop the trailing "Tap any chip to jump to the source" microcopy line into a single muted footer; keep the tone badge.

## 4. Past Briefs empty state — `src/components/briefs/BriefExportsList.tsx`

Currently every Summarize writes a `brief_exports` row with `status="exported"` and `storage_path=null`. We'll treat presence of `storage_path` as the signal for "real PDF export":

- Split rows into `pdfRows = rows.filter(r => r.storage_path)` and `draftRows = rows.filter(r => !r.storage_path)`.
- Render logic:
  - `pdfRows.length > 0` → render `pdfRows` as today (the list).
  - else if `draftRows.length > 0` → show: **"Living Brief updated. No PDF exports yet."** (muted, single line, no CTA box).
  - else → show: **"No exported briefs yet. Draft summaries stay in the Living Brief until you approve an export."**
- Keep loading state as-is.
- This only affects the project-scoped usage; entity-scoped usage shows the same logic and reads correctly because entity briefs that are real exports always have a `storage_path`.

## 5. Out of scope

- No DB schema changes.
- No changes to Sherlock surfaces, attach flows, canvas, or routes.
- No changes to PDF export pipeline.
- No changes to `vantaVoice.ts` beyond what Slice 3 already shipped.

## Files touched

- `supabase/functions/project-summarize/index.ts` — new schema, new prompt, new plain-text builder.
- `src/components/projects/LivingBriefBlocks.tsx` — new sections + legacy fallback.
- `src/components/briefs/BriefExportsList.tsx` — split PDF vs draft empty states.

## Acceptance

- Re-summarize a Ground Stay-style project: brief opens with a Situation paragraph that reads as one operational picture, followed by 2–6 themed groups, settled decisions, open risks/questions, and one Next Move. No "notes have been captured" / "filed" phrasing.
- Citation chips still jump to source cards.
- Project with summaries but no PDF exports shows "Living Brief updated. No PDF exports yet." Project with neither shows the "No exported briefs yet…" copy. Project with PDFs shows the list.
- Existing pre-v2 briefs still render via the legacy path until the user taps Summarize again.

Approved.

Proceed with Slice 4 exactly as planned.

No architecture changes.

No schema changes.

No route changes.

No Canvas changes.

No attach-flow changes.

Focus only on:

1. Rewriting project-summarize around the new v2 Living Brief structure.

2. Updating LivingBriefBlocks to render the new operational sections.

3. Keeping backwards compatibility for old briefs.

4. Fixing Past Briefs empty states so draft summaries and real PDF exports are clearly different.

The new Living Brief structure is approved:

- Situation

- Key Topics

- Decisions / Known Requirements

- Risks / Questions

- Next Move

- Sources

The most important rule:

Summarize situations, not objects.

Do not say:

“Notes have been captured.”

“Items have been filed.”

“Records were created.”

Say what is actually happening.

Example target voice:

“Ground Stay is currently focused on booking and availability cleanup. The main work is around calendar visibility, booking fee controls, unit availability, and making sure confirmed deposits properly turn into bookings.”

Citations should stay, but they should support the writing — not dominate it.

Proceed with the three touched files only:

- `supabase/functions/project-summarize/index.ts`

- `src/components/projects/LivingBriefBlocks.tsx`

- `src/components/briefs/BriefExportsList.tsx`

After implementation, test with the Ground Stay project and confirm the summary reads like an operations coordinator, not a database receipt.