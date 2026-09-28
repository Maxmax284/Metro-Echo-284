- [x] Clarify connecting-flight context and proposal actions
- [x] Make arrival guidance safe for unknown transfer/baggage state
- [x] Compact settled proposals without deleting history
- [x] Add focused regression coverage and verify flight suites
- [x] Publish after verification
## Connecting-flight local verification
- [x] Inspect landed transfer, provenance, receipts, and notification flows
- [x] Add contextual next steps and local fact capture with review
- [x] Add one-time acknowledgement and change-aware resurfacing
- [x] Add focused regression coverage
- [x] Run travel tests, typecheck, build, and mobile verification
- [x] Publish only after verification
## Journey continuity & entry readiness (Bangkok stabilization)
- [x] Record landing on TG637 + Bangkok place, retire stale Chantilly cue
- [x] Fix FlightDesk crash when live leg has no provider snapshot (TG637 case)
- [ ] Publish landing reflection + crash fix (publish was interrupted — retry)
- [x] Verify production shows Bangkok arrival; regression test for no-snapshot live leg
- [x] International entry readiness: Thailand TDAC official link, entry vs transit vs domestic follow-on, scam warning, honest fallback for other countries
- [x] Onward BKK→USM card with no flight number yet; explicit add path once known
- [x] Compact archival summary of completed legs in Receipts (no destructive cleanup)
- [x] Verify Gmail booking-watch end-to-end status; report Drive/Gmail API flags honestly; fix only small wiring defects
- [x] Regression tests: landing vs immigration vs entry vs transit, missing onward, no snapshot, TDAC applicability, unknown fallback
- [x] Tests/typecheck/build, 384px check, publish only after verified
## Travel Readiness Intelligence (foundation + TH/TW/SG)
- [x] Official-source registry: Thailand TDAC, Taiwan TWAC, Singapore SGAC — rules re-verified against government pages
- [x] Official filing window logic (window open / too early / undated) driving the border card and a Today cue
- [x] Prep checklist, kiosk-as-last-resort, free-vs-paid warning, user-reported (not government-verified) confirmation
- [x] Street Knowledge + form troubleshooter (steps only, no diagnosis, no form filling)
- [x] Tests for three countries, windows, transit vs entry, Thailand→USM no repeat; full suite green
- [ ] Remaining: real push/Telegram reminders for window-open (today it is an in-app cue only); more countries only with vetted official sources
## Info/About field-built origin
- [x] Audit and preserve every existing Info-page section, link and factual claim
- [x] Add the IAD → TPE → BKK → USM development story with bounded immigration and privacy language
- [x] Add focused regression coverage for route, whole-product framing and claim limits
- [x] Run full tests, typecheck, build and 384px/desktop visual verification
- [x] Publish only after all checks pass
## Real airport maps in layovers
- [x] Add an on-demand real airport map to active/upcoming layover cards
- [x] Show filed terminal/gate facts without invented indoor pins or distances
- [x] Label walking and taxi-out distance unavailable when geometry is absent
- [x] Verify flight/journey tests, typecheck, build, and 384px behavior
## Telegram jam/reset audit
- [x] Inspect Telegram connection, queue, recent failures, and current phone UI
- [x] Clear or reset only stale/broken delivery state; preserve captures, links, and receipts
- [x] Replace the generic "something jammed / send it again" fallback with honest, per-cause replies (allowance spent, rate limited, provider fault, unknown) that never ask for a re-send
- [x] One tail line per reply — a triage read or a provenance line, never both stacked
- [x] Verify send/receive path with a live message — flight question answered from the real journey (IAD → TPE → BKK → USM), no snag reply
- [x] Root cause of "it doesn't know": Telegram advertised the whole shared read catalog but only executed a few reads by name; every other read fell through to "On it." Now runs the same executor the app uses, and a tool that comes back empty says so instead of faking a done
- [x] Arrival alerts: landedAlert module + journey-watch pass sends one timed Telegram message per landing with gate, terminal and the board caveat

- [ ] Google Calendar connect failing ("failed, Lovable notified") — diagnose

## Ask background stabilization
- [x] Remove legacy CRT crawl, stepped neon flicker, voltage jitter, and pulsing Ask backdrop layers
- [x] Keep one static alley wall with a steady lamp while preserving Ask content and transitions
- [ ] Verify Ask at desktop and phone sizes, including room switching and an active response

## Header place chip (new ground)
- [x] Stack place name over the freshness stamp so both are readable at 384px; keep the whole chip tappable to the place board
- [x] Verify live at phone size with a signed-in session

## Local help on the Place board
- [x] Emergency-number strip keyed to the board place's country (fixed table, named country, no dialing)
- [x] Nearest care glance (ER/hospital/clinic/pharmacy) around the live fix with expander, kind chips, search, keep/forget
- [x] Saved-place boards keep the numbers and kept pins but never borrow the live care list
- [x] Verify live at 384px with a signed-in session

## Front door: ceremony gate + spray tag (Stage 1)
- [x] ceremonyGate: one welcome per landing (spray variant, dawn-shutter yields to boot/intro/pressure)
- [x] Boot claims the ceremony day at the shell's first render (peek/consume split in bootDecision); dawn shutter consolidated under the gate — race caught and closed live
- [x] Spray-can reveal on the logged-out door (once per device, sweep on return, static under reduced motion, tap-to-skip)
- [x] AUTH REJECTED terminal strip replaces toast-only sign-in failures
- [x] Tests (full suite green bar two known Telegram date expectations), typecheck, build, 384px live verification (spray, sweep, reduced motion, AUTH REJECTED, boot/shutter arbitration signed-in)
- [x] Published 2026-09-28

## Boot as one flow (Stage 2)
- [x] Boot cover rides from the first paint — power-up phase (wordmark lit, no claims) replaces the spinner screen and the naked-Today flash
- [x] Roll call speaks when facts are ready (auth + intro gate + place read), with a 4s cap that degrades to honest unknowns instead of stalling; place read still in flight says READING, never a premature NEW GROUND
- [x] Solari drums flip in one at a time behind their clacks; drum one rides through from power-up; hold time starts at roll start so load never eats reading time
- [x] Micro reopen and reduced motion skip the stagger; pressure mid-power-up cuts the cover without recording a boot that never spoke
- [x] Tests (stagger schedule, power-up cap, pending-vs-new-ground honesty), typecheck, build, 384px live verification signed-in (power-up at first paint, staggered roll, shutter, records)
- [ ] Deferred from the old Stage 2 line: FieldPolaroid's own Open-Meteo fetch — dedupe needs the snapshot to carry gauge-grade weather (feels/humidity/is-day) first, or the gauge loses data

## Region atmosphere (Stage 3)
- [x] regions.ts: seeded country-gated archetypes (island-coastal, capital-metro, northern-mist, brutalist-metro) for TH/TW/JP + DMV cities; city tried before region; unmapped or stale = honest nothing
- [x] RegionTintChannel applies region alongside band/daypart; both clear on stale fix and on sign-out; painted city walls still outrank the region mood layer
- [x] CSS: region classes bend the wash hues/saturation/grain/sheen; horizon moods on the place layer only when no painted wall is up; wash now consumes the sky dim/chill tokens
- [x] Tests (9 region-mapping/attribute cases; atmosphere suites 32/32), typecheck, build
- [x] Live at 384px signed-in: 2-day-old fix = no atmosphere claim (doctrine); fresh fix at Ko Samui → island-coastal + tropical + daypart, Bangkok wall keeps the place layer; wash probe confirmed hue response
- [ ] Publish Stage 2 + Stage 3 together

## Cultural moments + seasons (Stage 4)
- [x] stationEdition.ts: windowed kept-day editions (opt-in, fresh fix, country the list speaks; motif fallback "mark"; until = window end)
- [x] StationEdition decal on the Today concourse — expires on its own, remembrance stays quiet grey, non-interactive, says when it leaves
- [x] data-season from station.ts (band + hemisphere + date; September never assumed autumn) applied by RegionTintChannel, cleared on stale/unmount
- [x] CSS: season leans the wash (wet chill/dim, dry warm, spring/summer/autumn/winter shifts); edition stamp + tone/motif classes
- [x] Tests (9 edition + applySeason cases; atmosphere suites 53/53), typecheck, build
- [x] Live at 384px signed-in: Ko Samui → tropical + dawn + wet + island-coastal all honest; no decal out of window; celebration/water and remembrance/remember decal probes render correctly

## Station stamps + cabinet extensions (Stage 5)
- [x] src/lib/stationMarks.ts (pure): folds place.stamped/stamp_lifted + journey.wrapped_up/wrap_up_reopened receipts into marks still standing; rollback takes the mark off; name snapshots only, no coordinates; wallTilt from the key; rotatingDial picks one dial a day from what's known
- [x] useStationMarks hook: audit log read through the scope filter; null while unknown so nothing guesses
- [x] Station stamps wall in Receipts (StationStamps.tsx + .stamp-wall CSS): stamped places + closed trips as pressed stamps; empty state teaches
- [x] Cabinet sixth slot rotates daily — travel / platform clock / marks — never grows past six; provenance line per dial
- [x] 13 unit tests; no new audit events, no schema changes
- [x] Live verify at 384px signed-in: wall shows Ko Samui stamp + IAD→USM trip with the no-coordinates note; cabinet sixth slot rotated to marks (2) matching the wall; no page errors

## Journey replay + stamp provenance (Stage 6)
- [x] markRecord.ts (pure): journeyPlanIds splits the wrap's journey_id back into legs, orderLegs restores flight order, legRecordWords (shared with JourneySummary), placeStampBeats reads one place's press/lift life from the receipts
- [x] StationMark carries recordId — the place id, or the journey id from the wrap payload; null when pressed before records were linked
- [x] MarkRecordSheet: tap a wall stamp → its record. Journeys replay the legs as the books hold them + changes on record; places show press/lift beats + whether the place is still on the books. Lazy load on tap only; gone/unlinked records say so honestly; no coordinates
- [x] StationStamps: stamps are buttons now; useStationMarks returns the raw receipts so a mark's history needs no second fetch
- [x] Tests (12 mark-record + 18 station-marks green), typecheck, build
- [ ] Live verify at 384px signed-in: tap both marks, check journey replay + place beats
- [ ] Publish Stages 2–6 together (security scan is stale — refresh at publish)

## Awareness plan (approved 2026-09-28) — Phases 0-2
- [x] Phase 0: fix look_up thread-misdelivery; fix push failure_count increment; consolidate quiet-hours helpers; watch lifecycle receipts (created/checked/changed/stopped/paused); paused state support (watches.paused column + constraint migration 0039/0040)
- [x] Phase 1: Today "On the radar" card (states, last/next check, all-clear, zero-watch teaching, entry point); WatchShelf empty state + next check + pause; watch-health signal kinds; SourceHealthStrip wire-or-delete
- [x] Phase 2: Ask follow-up chips after live-world answers — Keep me updated (real watch only: page watch for a page answer, web_search topic watch for a question), Show affected areas as the next question in-thread, source chips + freshness, decline cooldown per answer; current-events phrasing routes to a live lookup (converse prompt + capabilityRouter); lookup answers land in the open thread live (no revisit needed); streaming writer pinned to its own message index so follow-ups can't steal the caret
- [x] web_search watch pulled forward from Phase 6: "Keep me updated" on a question needs a real recurring mechanism — a single-page watch cannot cover a topic. 6h cadence, 14-day stop, quiet until new pages show; fingerprint compares the set of pages, ranking order is jitter
- [x] Verify: typecheck clean; 49 focused tests (web-look fingerprint/diff, worldFollowUps, router); full suite 2292 passed, 2 known Telegram date failures; build OK; web-look/watch-sweep/vanta-converse deployed
- [x] 384px live pass signed-in: "What's going on with the Bangkok flooding?" → live answer with named sources (youtube/straitstimes/bangkokpost, read just now) + Keep me updated / Show affected areas chips → tap starts a real watch, chip flips to watching, receipt line lands in-thread; console clean of new errors
- [ ] NOT in this build: Phases 4-6 (Notifications unification, Settings reorg, remaining topic-watch surfaces)

## Awareness plan — Phase 3 (Receipts provenance)
- [x] Journey notices leave audit rows — journey.moved / journey.notice_updated / journey.before_you_leave / journey.landed written beside the nudges (journey-watch, deployed)
- [x] Briefing refreshes leave a receipt — briefing.regenerated with { section, corrected, confidence, fallback }; awareness_briefings already append-only, so earlier versions stay and a correction-shaped refresh says so
- [x] Correction receipts completed — FindingFeedback + useContinuity now write correction:* audit rows (FeedbackBar/useSignalRoute already did); colon-format corrections get plain labels instead of raw tokens
- [x] Plain labels for watch.* / nudge.* / journey.* / correction:* / briefing.regenerated + trustNote families + eventWhere (watch→Today, flight_plan→Flights, awareness_place→Awareness); delivered heads-ups count as "What Echo did"; journey events bucket to Schedule
- [x] Tests: 8 plain-labels + 2 new digest cases; full suite 2302 passed, 2 known Telegram date failures; typecheck clean
- [x] 384px live pass on Receipts — signed in, no raw tokens anywhere, watch/journey rows render plain, no page errors (drawer labels covered by unit tests)
- [x] Documents desk elevated to its own visible station on the main Work shelf; "Analyze document" affordance next to "File it" (user request, same round as Phases 0-2)
