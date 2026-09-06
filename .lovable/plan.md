# Metro Echo — Release-Grade Smoke Test

Goal: prove the current system behaves as one product across Today / Work / Ask / Receipts, Telegram, local reality, projects, briefings and generated files — before any expansion. No fifth room, no test-only architecture, no second receipt or artifact system.

## What the database says right now

Confirmed by direct query just now: 0 projects, 0 documents, 0 file exports, 0 trips, 0 commitments, 0 calendar feeds; 4 conversations, 4 saved places, 2 arrived files, 1 nudge, 1 linked Telegram chat, 104 recorded events.

Two consequences: the golden path *is* the fresh-user path (nothing to lean on), and any surface that has only ever been seen with empty data has not actually been exercised.

---

## A. Smoke-testable today

| Area | Where it lives |
| --- | --- |
| Four rooms + tabs | `src/lib/navigation.ts`, `src/components/shell/SurfaceTabs.tsx` |
| Today read, ranking, calm/drift/pressure | `TodaySurface.tsx`, `useSituation.ts`, `useShellWeather.ts` |
| Work front page, projects, briefing lanes | `WorkSurface.tsx`, `ProjectsSurface.tsx`, `BriefsSurface.tsx` |
| Ask threads + capability router | `ConversationSurface.tsx`, `vanta-converse`, `awareness-query` |
| Receipts, held-back, action lifecycle | `AuditSurface.tsx`, `HeldBackPanel.tsx`, `src/lib/heldBack.ts` |
| Telegram in/out, pairing, "Why this?" | `telegram-webhook`, `telegram-send`, `_shared/telegramWhy.ts` |
| Local reality, saved places, map, evening read | `AwarenessSurface.tsx`, `AwarenessMap.tsx`, `eveningRead.ts` |
| Trips as shared session | `trip-session` function, `_shared/tripSession.ts`, `useTrips.ts`, `useFieldSession.ts` |
| Intake + first-pass refusal | `files-ingest`, `_shared/fileIntake.ts` |
| Briefings and PDF | `compose-brief`, `BriefPdfDocument.tsx`, `briefs.ts` |
| Word file, kept and listed | `documentDocxExport.ts`, `BriefExportsList.tsx` |
| Suppression evidence + look-now | `awareness-drift-sweep`, `HeldBackPanel.tsx` |

Instrumentation from the previous pass is already in place: export receipts carry project / document / conversation ids, Word files are stored and listed, documents record their originating thread, app trip writes go through the server, and Receipts can trigger its own sweep.

## B. Partially testable — would mislead without care

- **Calendar and commitment context.** No feed and no commitment exists, so "next thing" and collision signals can only be tested by creating them by hand during the run. Report them as *created for the test*, not as observed behavior.
- **Location precision and staleness.** Real fixes come from the browser or Telegram; the drag-to-fix path is testable, but "stale" copy needs a deliberately old fix to appear.
- **Designed report vs operational document lanes.** Both code paths exist. Only the operational lane (draft → review → PDF/Word) has real inputs today; the research/report formats can be generated but have nothing grounded to cite. Smoke-test the operational lane; note the other as generated-but-unfed.
- **Nudge delivery to Telegram.** Requires opt-in preferences and non-quiet-hours; expect held-back rather than delivery unless prefs are set first.

## C. Not testable now

- Cross-analysis over many documents (needs several documents; there are none).
- Version comparison and obligation tracking over time (single-pass only).
- Screenshots inside generated files — the artifact builder has no image section.
- Any Walk-With-Me escalation beyond shared trip state. Out of scope by law.

## D. Golden path (one scenario, in order)

1. Read Today cold. Capture it before anything changes.
2. Create a real project in Work. Add one commitment with a due time and one calendar-ish anchor.
3. Import one clean source file. Confirm it lands, is typed, and links to the project.
4. Send one photo/screenshot of poor quality through Telegram. Expect "couldn't confirm" and a review flag, not a guess.
5. Ask Echo two cross-source questions in Ask: one answerable from the project + files, one that cannot be confirmed.
6. Start a trip from Telegram, add a point, read it in Metro Echo, end it. Check Today and the local room agree.
7. Compose a briefing from the project. Approve it. Generate the PDF, then the Word file.
8. Reopen both files from the list. Confirm they open and carry Metro Echo / Echo naming.
9. Walk the receipt chain end to end: received → read → relevance → suppression → prepared → approved → executed → file created → delivered → final receipt.
10. Read Today again. It must have changed for the right reasons and say what changed.

## E. Failure paths (each must be plain and safe)

Stale location; unreadable screenshot; incomplete document; Telegram switched off; question about a missing source; unconfirmable question; deliberately broken file generation; sweep during quiet hours. Expected posture in every case: name what it couldn't confirm, say it didn't guess, offer the next real step. No silent success, no invented value.

## F. Evidence screenshots

Today before, Today after, Work project open, briefing in Work, Ask grounded answer with "Why this?", Ask refusal, Telegram thread, local room with map and saved places, trip in both surfaces, Receipts chain, held-back panel, artifact preview, final PDF, final Word file, and at least two failure states. Each at 384px and once on desktop.

## G. File verification

Facts in the file trace to real rows; no invented numbers; headings and tables not clipped; Metro Echo / Echo naming; downloadable, reopenable and listed with the right extension; row links back to project, briefing and document; a receipt exists for generation.

## H. Receipt verification

Every step above leaves exactly one event, in order, with ids that join to the real project / document / export / conversation. Suppressed items appear as held-back with the true reason. Undo appears only where rollback is real.

## I. Cross-door verification

Work project asked about in Telegram; Telegram file usable in Ask and Work; briefing made in Ask visible in Work; action from Ask visible in Receipts; suppression visible in Receipts; trip and local state identical in every room.

## J. Fresh-user and 384px

Because the database is empty, run the whole path as a first-time user and flag every point that needed insider knowledge. At 384px check hierarchy, tap targets, and that density is never solved by shrinking text. Accessibility basics: reduced motion honored, visible focus, contrast, keyboard where relevant, nothing meaningful by color alone.

## K. Instrumentation before the run

Already landed. Remaining pre-run setup is data, not code: turn on proactive awareness for the test account, add one calendar feed, and confirm the Telegram link is live.

## L. Order of work

Set up test data and preferences → golden path → failure paths → fresh-user and 384px pass → accessibility pass → assemble the Proof Pack.

## M. Ready for expansion when

Every golden-path step passes, every failure path refuses cleanly, the receipt chain joins end to end by id, both file types open and are listed, Telegram and the app share one trip and one thread, Today changes for the right reason and says so, and the 384px pass shows no hierarchy or tap-target failures.

## The Proof Pack

One dated folder per run, assembled from what the system actually recorded — no new dashboard. Contents: build and commit, scenario and environment, pass/fail matrix, the screenshots above, Telegram and local-context evidence, the briefing and both generated files, the receipt chain, held-back examples, failures with severity, and ids linking back to the real project, briefing, file, receipts and conversation.
