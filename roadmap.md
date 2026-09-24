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
