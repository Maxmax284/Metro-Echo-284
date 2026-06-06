# Simplification plan

## Step 1 — Five-tab navigation ✅
Cockpit · Inbox · Projects · Briefs · Receipts. Everything else lives in More.

## Step 2 — Inbox surface ✅
Captures / Notes / Files subtabs, shared selection, bulk Attach to project.

## Step 3 — Project / Living Brief restructure ✅

Reordered the project page so the most decision-useful information sits at the
top, and added an AI Summarize step that turns attached items into a draft
living brief.

### New section order
1. **Recent changes** — anything attached or updated in the last 7 days.
2. **Needs me** — open commitments + pending actions, due-soonest first.
3. **Signals** — Sherlock findings attached to this project.
4. **Notes** — full bodies inline.
5. **Files** — uploads + extracted text preview.
6. **Captures** — Telegram / email / voice transcripts.
7. **Receipts** — last 15 audit events scoped to this project.

### Summarize
"Summarize" button next to Save in the Living brief block. Calls
`project-summarize` edge function which:
- Pulls notes, captures, files, findings, commitments, actions for the project
- Sends a single Lovable AI Gateway call (gemini-2.5-flash)
- Returns plain-English brief text (4–7 paragraphs / bullets)
- Writes one `project.summarized` audit event

Result lands in the textarea as a draft — user must press Save to commit. No
silent writes.

### Files
- New: `supabase/functions/project-summarize/index.ts`
- Edited: `src/pages/ProjectBrief.tsx` (section reorder + Summarize button +
  receipts loader)

## Next
- Step 4 (optional): tie `brief_exports` to projects via grounding so the
  Project page can show "Saved exports" alongside Receipts.
