# Metro Echo — Grounded Audit and Simplification Plan

Verified counts (this repo, this database, today): 63 edge functions, 307 components, 77 test files, 14 surfaces, 10 Work desks + 4 rooms, 20 routes.
Live data: audit_log 215, telegram_messages 18, brief_exports 12, actions 6, notes 5, conversations 5, awareness_places 4, ingested_files 4, nudges 3, calendar_events 2, sherlock_findings 2, projects 1, documents 1, calendar_feeds 1, push_subscriptions 1, wearable_readings 1. Zero: commitments, trips, trip_points, field_notes, entities, investigations, cross_ref_cases, research_objects, case_records.

Verdict: the plumbing is real, the intelligence layers are real, and the product is starved. Nothing here needs another engine. It needs feeding, deleting, and one honest interaction language.

## A. What earns its keep, what doesn't

Earns it now: Today's read (`TodaySurface.tsx`, `useSituation.ts`, `useTodayDigest.ts`), place truth (`placeMove.ts`, `useTodayPlaceCue`, `AwarenessSurface`), Telegram capture (`telegram-webhook`, 18 real messages), receipts (`AuditSurface`, `action_events`, 215 events), artifact generation (12 real exports), awareness judgment split (relevance → urgency → suppress → deliver, all in `_shared/awareness`).

Impressive but underfed or undiscoverable: Sherlock detectors (2 findings), cross-reference cases (0), investigations/research (0), entities + semantic search (0 rows), trips/field notes (0), wearable stack (1 reading, 4 routes), documents intelligence (1 doc), commitments (0 — yet Today ships a Tasks lane, Commitments desk, reminders function and drift detectors on top of an empty table).

Feels like a companion: Today's lead line, place cue, Telegram in, held-back panel.
Feels like software modules: Work's ten equal desks, Memory, Briefs, Command, Sherlock's own room-inside-a-room.

Biggest blockers: (1) almost no calendar/commitment truth to reason over — 2 events, 1 feed; (2) structure is user-typed, not capture-proposed (only `projectSuggestions.ts` proposes anything); (3) nothing is deletable or dismissible except by accident; (4) 6 orphan demo routes make the product look like a lab.

## B. Today — control without clutter

Rendered on Today today: SituationRead, PlaceCueStrip, SourceHealthStrip, AskVantaBar, TickRow, CrossDeviceResume, FieldSessionCard, EveningReadCard, ResumeWorkSection, NoticedRow, GotSomethingChooser, FirstLapCard, TodayBodyPanel, Happening-now lane, Needs-you lane, Next-up lane, Travel lane, Tasks lane, What-changed section.

Dismiss audit, verified: only `NoticedRow` (nudge → `dismissed` + audit event), `FirstLapCard` and `CrossDeviceResume` (localStorage), `ResumeWorkSection` (`useContinuity.dismiss`). Everything else — including the "Review changes" line, which is `SituationRead.tsx:22` `waiting_on_you` — has **no** ignore, snooze, handled or clear path. Confirmed: situation lines are pure derived output with no per-line state at all.

Proposed semantics (five distinct meanings, no synonyms):
- **Ignore** — this kind of thing, not now. Presentation state + a suppression receipt, expires (e.g. 7 days).
- **Snooze / Save for later** — still true, ask me at a time. Persistent, reappears, receipt on reappearance.
- **Mark handled** — I did the real-world thing Echo can't see. Closes the underlying row where one exists (commitment/action/file), receipt always.
- **Remove** — take this row out of my view; source truth and receipts stay. Presentation only.
- **Clear settled** — one sweep that removes only lines whose underlying state is already resolved. Never touches open work, never deletes rows.

Interaction: long-press / overflow on a line (reuse `useLongPress.ts`, existing dropdown pattern), no toolbar, no card manager. Bundling stays: an ignore applies to the situation, not to each fact.

## C. Work — three shelves, not ten departments

Current desks: projects, inbox, briefs, memory, commitments, schedule, actions, sherlock, awareness, command (`navigation.ts` ADVANCED_SURFACES).

Recommended shelves: **What's landing** (inbox, schedule, awareness) · **What I owe** (commitments, actions, projects, briefs) · **What Echo noticed** (sherlock, memory). Retire `command` — Command Center duplicates Today's read. Hide desks with zero rows behind "nothing here yet" reveal rather than showing ten equal tiles.

Delete controls today: projects have a real delete (`projects.ts:132`), notes delete (`InboxNotesList`), files archive (`FileAftermathTray`), Ask threads archive/restore (`ThreadSpine`), executors delete. Nothing for commitments, actions, documents, briefs, investigations, findings, saved places, trips.

## D. One deletion philosophy

- Hard-delete: only user-authored drafts with no receipts — notes, saved places, unsent drafts, Ask threads, calendar feeds.
- Archive (reversible, still queryable): projects, documents, briefs, commitments, findings, files. Reuse the lifecycle vocabulary already in `intakeLifecycle.ts` / `fileIntake.ts` / `projects.ts` instead of inventing one.
- Remove-from-view only: situation lines, nudges, Today rows.
- Never deletable: `audit_log`, `action_events`, `brief_exports`, approvals, suppression receipts.
- Confirmation scales: quiet for view-removal, one tap for archive, typed/named confirmation only for hard delete of something with attachments.
- Undo only where rollback is real — the existing rule and existing `actions` rollback path stand; no new action system.

## E. Ask — worth opening

`ConversationSurface` already computes `suggestions` from tools. Change the source, not the mechanism: derive 2–3 questions from live state — "What changed since this morning?" (audit_log delta), "Anything waiting on me?" (staged actions / overdue), "What do I need before <next event>?" (calendar), "Why is this on Today?" (deep-linked from a line). They vanish when their state is empty. Provenance, scope and Telegram continuity already exist and are reused.

## F. Receipts — a weekly human read

All inputs exist (`audit_log`, `action_events`, held-back, `brief_exports`, `sherlock_digests`, `recap-compose`). Add a period read on top of the same rows: what came in, what Echo noticed, what it held back and why, what you approved, what ran, what failed, what it made. Cost is stated as attention (interruptions sent, held back, approvals asked) — no invented money. Raw log stays underneath, unchanged.

## G. Feed it, one connection at a time

Verified feeds: 1 iCal calendar feed (2 events), 1 Telegram link, email inbound function, files-ingest, places by hand, 1 push subscription, 1 wearable reading. Google Calendar is the highest-leverage next feed — it is the only source that would make Today's lanes, drift detectors and preparedness real. It stays blocked until a Google connection exists; iCal keeps working.
Then: capture proposes structure (project, commitment, place, intention) as candidates; confirmation is asked only where structure has consequence. Extend `projectSuggestions.ts`; do not add a second suggestion engine.

## H. One interruption, many surfaces

Already exists: relevance/urgency/suppression/delivery split, `dedupe_key`, `signalDedupeKey`, quiet hours (`suppress.ts:115`, `inboundReach.ts:80`), idempotency keys, `liveChannels()` double-consent gates, held-back receipts. Missing: a shared **acknowledgment** record — delivered/seen/handled per signal identity across Today, Telegram, push, watch. That's the one genuinely new piece. Push = interruption; Telegram = conversation; Today = surface next time; summary and ask-only are the lower rungs. Recent-notification load feeds normal priority only; critical is never suppressed.

## I. Companion primitives (ranked, later)

Reuse-first: gap summary ("what changed since I last looked") from `audit_log`; preparedness from calendar + files; still-true after disruption from `calendar_changes`; loose ends from open actions/commitments. Genuinely new primitives: baseline/rhythm, transitions, intent memory, context packs that dissolve, decision continuity, contradiction awareness, freshness beyond location, natural-language attention rules.

## J. Future-expansion collisions

Body/wearable already has four routes and a table with one row; Food/nutrition has nothing. Before any Body/Food build, the wearable demo surfaces must be consolidated or they become museum pieces. `entities`/`entity_relations` are the right substrate for object continuity and should not be duplicated.

## K. Orphan routes — verdicts

`/motion` — retire, linked only from `WorkBodyLine`. `/glance`, `/watch`, `/wearable-loop`, `/physical-loop` — collapse into one wearable desk under Work; keep hooks and `wearable-*` functions. `/how` — keep, it is Ask's explain target. `/documents`, `/projects` — keep. Underlying capability is preserved in every case.

## L. Smoke test status

The gate is `.lovable/plan/metro-echo-release-grade-smoke-test-2026-09-06.md`. Verified: no evidence pack, no screenshots, no results file exist in the repo — the run has not happened. Its own preconditions (project, commitment, calendar anchor, trip) are still mostly unmet: 0 commitments, 0 trips, 1 project.
Land now (invisible or additive): delete/archive controls, orphan-route retirement, Work shelf grouping, Ask live suggestions. Wait for baseline capture: Today's dismissal affordances and the weekly Receipts read, because both change the screenshots the gate depends on. After simplification, run a focused Proof Pack — Today read, one approval chain, one artifact, Receipts chain — not the whole suite.

## M. Product health signals

Meaningful sources connected · days with enough context for a real Today read · cross-source situations · bundled vs duplicate notices · held-back count and reasons · corrections made · approvals asked vs granted · provenance opened · expectations closed · duplicate deliveries avoided. All derivable from `audit_log` and awareness receipts; no new telemetry, no content leaving the user's own rows.

## N. Order of work

1. Capture smoke-test baseline evidence.
2. Orphan-route retirement + Work three-shelf grouping (cleanup, low risk).
3. Delete / archive / clear controls with the five semantics.
4. Google Calendar feed, then capture-proposes-structure.
5. Ask live suggestions + weekly Receipts read.
6. Acknowledgment model across surfaces (the one new engine-adjacent piece).
7. Companion primitives: gap summary, preparedness, still-true, intent memory.
8. Only then the pinned Body / Food / device expansion.

Each item above is marked in its section as reuse, wire-and-polish, or new. Nothing here adds a fifth room, a second notification engine, a second action system, or deletes durable provenance.
