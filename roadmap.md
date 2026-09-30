# Roadmap

## Street-transit sprints (radar call-box arc)
- [x] Sprint 1 — Radar call-box: forced Check now, live "top of the board" headlines, Ask Echo debrief from any watch row.
- [x] Sprint 2 — Concourse transit line above the dock + Solari split-flap radar headline (transfer overlay already riffles room names).
- [x] Radar dispatch slip — tapping a watch row opens an in-place bottom sheet (state, rhythm, top headline, sweep log from receipts, Check now / Pause / Stop, "Dig deeper with Echo" escalation). No more leaving Today to read a watch.
- [x] Sprint 3 — Thermal ticket Receipts: ledger is a perforated roll, rubber-ink stamps (FILED / APPROVED / WAITING / HELD BY QUIET HOURS / FAILED), conductor hole-punch on filed+approved, aged ink past 24h, tap snaps open the provenance drawer.

## Aware room + station audio
- [x] Aware room: seed a live device fix (auto when permission granted, one-tap card otherwise) so the room never sits empty.
- [x] Aware room: "Open dispatches" rail — world nudges + needs_you watches, same queues Today reads.
- [x] Station audio: muffled hum loop under Today/Work/Receipts, Solari clack on room entry, speaker toggle in the top shell.

## Radar intelligence overhaul (post-screenshot audit)
- [x] Junk domain blacklist — social/video/app-store/forum hosts stripped at the source in serpSearch.
- [x] Real AI sitrep synthesis — web-look search mode feeds filtered hits to Gemini for a 2–3 sentence ground-truth sitrep; no more raw bulleted link dumps.
- [x] Echo dead-air killed — reading pulse stays alive until the intent handler's answer lands; no more blank bubble wipe.
- [x] Tactical radar scope — SVG concentric rings, rotating phosphor sweep, deterministic blip per watch (amber=attention, cyan=steady), reduced-motion safe.
- [x] Zombie watch cleanup — old failed Bangkok watch purged, stale outcome/last_read cleared for fresh start.
- [x] AI verdicts in the background sweep — shared `_shared/sitrep.ts` brain (web-look + watch-sweep); fingerprint stays the cheap pre-filter, AI reads only on change or first read; verdict rides `last_read` + nudge title, citations stripped on the board, fails soft to the raw headline; opening sitrep written at watch creation.

## Echo talks like it knows something (dual-brain depth pass)
- [x] Gag rules out — routingRules/vantaVoice drop the 2-sentence/6-bullet caps; completeness-first.
- [x] Depth budgets lifted — desk 14 / phone 8 / telegram 8 sentences as ceilings, "never drop a fact that changes the decision to stay short".
- [x] Shared Responses client `_shared/responsesChat.ts` — gpt-6-astra conversational brain for the Echo room + Telegram; Gemini keeps radar/search + the read pre-pass.
- [x] Suite green, both functions deployed, live-checked at 384px.

## Week-length answers (depth tune)
- [x] Phone + Telegram budgets 8 → 12 sentences; WEEK_READ shape (lead with the shape of the week, one line per day that carries something, clear days named not itemized, ceiling stays a ceiling).
- [x] In-app week question un-silenced — query_schedule tool retired from the answering model (chips still use the client intent); calendar context now holds the next 8 days, not the next 8 rows.
- [x] Telegram "this week" actually reads a week — new deterministic week read in calendarRead (7 days, stay listed once, clear days counted, cap 12 lines).
- [x] Live-checked: week question answers in prose, names the limit when the calendar is empty; 26/26 depth+calendar tests green; both functions redeployed.

## Live-place truth (Fairfax autopsy)
- [x] awareness-query anchored to the live fix — same LIVE_FIX_SOURCES list the app reads; a named/saved row can never teleport answers again.
- [x] Stamped ground outranks a newer unstamped fix — the stamp means "Echo answers from here", and a real move still lifts it.
- [x] Spinner copy honest and fast — "Processing…" replaces "Checking live sources…", pulse shows at 400ms not 1200ms; ProcessingLine/processingLabel match.
- [x] Stamp copy plain — "Your ground since Sep 26. Echo answers from here."
- [x] awareness-query answers stay prose — no invented conditions without briefings, briefing field-labels stripped server-side. Live-checked on Maxwell's account: Ko Samui anchor, honest low confidence.

## Parked tracks
- [ ] Telegram capture bridge — test on Maxwell first (Vanta sequencing), then Ground Truth Hub, then CampCore.
- [ ] Documents roadmap — voice revise, multi-turn intake; parked items stay parked.
- [ ] Field Beacon / live GPS — pinned, not to build.
