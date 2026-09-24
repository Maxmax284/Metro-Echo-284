# Work intake: fewer desks, sorted arrivals, lighter documents

Scope: Telegram + in-app upload. Echo only suggests. Nothing gets filed without your tap.

## 1. Arrivals come with a suggested home
- Every new capture or file in "Just arrived" gets one line saying where it probably goes: "Looks like it goes in **Lamai Camp** — File it / Somewhere else / Leave it".
- The suggestion uses the project matcher that already exists (the one behind "Attach items"), so projects, notes, Telegram files and uploads are all matched the same way. No new AI call and no new scoring.
- If nothing matches well, it says "Not sure where this goes" and gives you a project picker. It doesn't guess.
- "File it" attaches the item and writes a receipt, with undo. "Leave it" uses the dismissal that already exists, so the item stops asking.
- Telegram: after a file lands, the reply names the suggested project in one line ("Saved. Looks like Lamai Camp — file it in the app."). It never files from chat.
- Fix a gap: text sent in Telegram reaches the arrivals lane the same way files do. Today only notes get counted there.

## 2. Fewer desks
The Work front page drops to three shelves:
- **Needs you**: approvals and promises that are due.
- **Arrived**: unsorted items, now with suggestions.
- **Projects**: each project's card shows its own documents, briefs and files.

Documents, Briefs, Schedule, Sherlock and Awareness move to one small "More desks" row. The pages stay where they are, only the front page gets lighter. The duplicate Documents link in the "Jump" row goes away.

## 3. Documents in one tap instead of four
- "Treat as document" now also reads the file straight away, because its text was already pulled out when it arrived. You land on a document that's ready to review.
- The review and draft steps show up as one "Next step" button that changes with where the document is, not three buttons side by side.
- Sensitive files still never get the document option. The BETA banner stays honest.

## Technical details
- `useWorkBriefing` / `workBriefing.ts`: attach `suggestion {projectId, title, score}` per arrived item via `loadProjectSuggestions` inverted per item (threshold; below it returns null → "not sure").
- Include Telegram-captured `messages` (inbound, unfiled, 7d) in arrived, deduped against `project_items` + `intake_dismissals` through `intakeLifecycle`.
- File-it path reuses existing `project_items` insert + audit event. Dismiss reuses `project_suggestion_dismissals`.
- telegram-webhook file branch: append the suggestion line using the shared matcher. It's read-only and adds no tool.
- `WorkSurface.tsx`: regroup the shelves and collapse the rest into "More desks". Routes and `navigation.ts` stay the same.
- `treatFileAsDocument` → call `runExtraction` in the same flow. `DocumentDetailSheet` gets a single status-driven primary action.
- Tests: suggestion threshold and null case, arrived including Telegram messages, file-it receipt, shelf grouping, auto-extract. Then the full suite, typecheck, build, and a check at 384px wide. Publish only after all of that passes.
- No database changes.
