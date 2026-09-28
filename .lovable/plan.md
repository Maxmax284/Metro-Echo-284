# World-awareness, watches and notifications — audit + integration plan

Goal: make "Echo keeps an eye on things" obvious and connected across the four rooms, reusing the machinery that already exists. No fifth room. Doctrine holds: never claim monitoring without a real active watch; checks stay quiet unless something meaningful changed; Plan → Approve → Execute untouched.

## 1. What already exists (reuse, don't rebuild)

**Watches are real and proven.** `watches` table (goal/kind/state/cadence_minutes/next_check_at/last_check_at/attempts/max_attempts/stop_at/success_when/outcome, scope-ready via organization_id). Kinds today: `action_settled`, `calendar_event`, `web_page`. States: `on_it → watching/waiting → needs_you → done/couldnt_finish`. `watch-sweep` is the cron checker; `_shared/watch.ts`, `watchApply.ts`, `watchIntent.ts` are the shared engine. Ask already has `keep_an_eye_on` / `stop_watching` / `whats_being_watched` tools. `web-look` does search/read/watch over the live web (SerpApi). Live proof: a calendar-event watch created from Ask ran to `done` with a recorded outcome.

**One delivery arbiter exists.** `_shared/delivery/reach.ts`: phone push first, Telegram fallback, never both, deduped via the `deliveries` table, with real deep-links (`rail.ts::pushPayload` sets url + tag) and Telegram "Open in Metro Echo" buttons. Push plumbing (`webpush.ts`, `push-config/test/diagnose`, `push_subscriptions` with last_error tracking) is solid.

**The awareness pipeline is the judgment layer.** `_shared/awareness/` registry has 15 signal kinds incl. `web_page_changed` (the only watch-linked one), plus relevance → urgency → suppress (12 reasons incl. quiet_hours, cooldown, attention_budget) → bundle → deliver. Live channels: in-app always; Telegram/push opt-in. This is exactly the "checking vs notifying" separation the brief asks for.

**Flight disruption is the mature template.** `journey-watch`: budgeted (api_usage_logs ledger), diff-only, deduped, quiet-hours gated, honest caveat ("the board in the terminal wins"). Its nudges land in `nudges`, not `audit_log`.

**Receipts already render anything.** `ReceiptsLedger` is generic over `audit_log` with status buckets; `ReceiptSlip` exists.

**Research sourcing machinery exists backend-side.** `_shared/orchestration/research.ts` classifies authority/freshness/agreement; `vanta-converse` injects a cite-by-name research block — but only for research-phrased questions.

## 2. What is missing

- Today has zero watch/world-awareness visibility. `WatchShelf` (the only watch UI) lives only on Work, renders nothing when zero watches (no discovery copy), and never shows `next_check_at`.
- No watch-health signals: `watch_stalled` / `watch_failed` / `watch_no_change` are not in the registry — a dead watch is silent, which reads as "nothing changed."
- No topic watches: kinds stop at web pages/calendar/actions. No "Bangkok flooding" style subject watch.
- No citation/source UI in chat; authority/freshness data never reaches the front end.
- No Notifications settings screen. Quiet hours (Time & reminders), push (Awareness & senses), Telegram (3 places) are scattered; connection health appears in 4 places.
- No priority model: every push sends `Urgency: high`; business urgency exists upstream but isn't mapped.
- No watch lifecycle receipts: no `watch.checked/changed/stopped/paused` events; no `correction.*` events; journey disruption notices never become receipts.
- Briefings are overwritten, not versioned; changed facts silently rewrite history.
- `world_facts` table is dead schema — zero readers/writers.
- `paused` watch state doesn't exist.

## 3. Overlap, duplication, conflicts

- Two web-search paths: in-turn `lookupSources` (prompt-injected) vs client-invoked `web-look` mode search. Same provider, different gating/rendering.
- Bug: `look_up`/`check_page` results are written to the *most recently updated* conversation, not the originating thread (`useIntentHandler.ts:618-623`).
- Bug: `push_subscriptions.failure_count` is never incremented — the stale-subscription diagnostic can never trip.
- Quiet hours implemented independently in 4+ functions; defaults 22:00–07:00 in `profiles.preferences`.
- Naming collisions: wearable "Watch" page vs `watches`; `lookAt.ts` (vision) vs `webLook.ts` (web).
- `SourceHealthStrip.tsx` exists but is wired nowhere.
- `journey_moved`/`flight_before_you_leave` live in `nudges`, so Receipts under-represents the best live-world feature.
- "Awareness" surface is place-centric; the word must not blur with world-watching.

## 4. End-to-end connection map

```text
DISCOVER ─ Today radar card (empty state teaches) / post-answer offer / post-flight offer
ASK ─ live-world question → web-look answer + cited sources → offer "Keep an eye on this?"
FOLLOW ─ one tap creates a real watch (kind: topic/web_page) → watch.created receipt
CHECK ─ watch-sweep on cadence → no change: silent, attempts+next_check advance
CHANGE ─ meaningful diff → awareness signal → Today card (+ opt-in push/Telegram deep-link)
TRUST ─ card shows state, last check, next check; failure says so loudly
RECORD ─ every creation/change/delivery/stop lands in Receipts; corrections traceable
MANAGE ─ Today card, Work shelf, or Ask ("stop watching X") → watch.stopped receipt
```

Today gets one "On the radar" card (watches + health + all-clear + entry point), Work keeps the shelf as the manage surface, Ask is the conversational front door, Receipts is the record. Awareness surface stays place-centric; world watches do not move there.

## 5. Settings IA (reorganized, deduplicated)

1. **Getting started** — guide, how it works, install.
2. **You & your voice** — operator profile, brand voice.
3. **Your awareness** — proactive-awareness toggle, posture, sensors, occasions, watches overview link. (New home; absorbs most of current "Awareness and senses".)
4. **Notifications** — NEW: push readiness (moved here), quiet hours (moved here), Telegram reach + test, digest behavior (Sherlock weekly), per-category push-vs-digest controls, delivery status. Single home; removes the 3-way split.
5. **Time & calendar** — timezone, day defaults, calendar feeds, Google calendar connect.
6. **Inbox** — mail connect and sweep.
7. **Connections & workspaces** — Telegram link, integrations status (single health home), workspaces, connected accounts merged in.
8. **Look & feel** — skins, motion.
9. **Records & spending** — cleanup, API records, usage/cost.

Connection health renders once (SystemHealthLine → one integrations page); Google status component stays shared but is reached from calendar/inbox only.

## 6. Status models

**Watch states** (extends existing text column, no type change): `active` (on_it/watching) · `checking` (next_check_at future, last_check_at set) · `no change` (attempts>0, no outcome) · `update` (needs_you) · `paused` (new value, user-set) · `failed` (couldnt_finish + last error) · `stopped/done`. Card always shows last successful check + next expected check; a failed/stalled watch is a status, never silence.

**Notification levels:** `urgent` (breaks quiet hours, push) · `important` (push outside quiet hours) · `informational` (Today only) · `digest` (batched). Mapped to WebPush Urgency header and the existing urgencyRank; user sets per-category floor (push vs digest) in Notifications.

## 7. User journey (acceptance story)

New user with zero watches sees the radar card on Today: "Echo can keep an eye on things that matter to you — ask about anything in the world." They ask about Bangkok flooding, get a sourced briefing, tap "Keep me updated." Watch created, receipt written, card flips to "Watching: Bangkok flooding — checked 12:04, next 12:34, no change yet." Days of quiet checks stay silent. A real change fires a signal: card says what's new, optional push deep-links to the briefing. Receipts show created/checked/changed/notified/stopped. Stop from card, shelf, or Ask. Declined offers set a cooldown and never nag.

## 8. Phased implementation (smallest safe sequence)

- **Phase 0 — foundations (low risk, no schema):** fix look_up thread-misdelivery bug; fix failure_count increment; consolidate quiet-hours into one shared helper; add watch lifecycle audit events (`watch.created/checked/changed/stopped/paused`); add `paused` state support.
- **Phase 1 — Today radar card + WatchShelf upgrade:** new pure reducer + card on Today (states, last/next check, all-clear, zero-watch teaching state, entry point); WatchShelf gains empty state, next_check_at, paused; add watch-health signal kinds to the registry. Wire SourceHealthStrip or delete it.
- **Phase 2 — Ask front door:** answer-derived follow-up chips (Keep me updated / Affects my travel? / What changed since last time) after live-world answers; source chips with authority/freshness in chat; widen research routing beyond RESEARCH_PHRASES for current-events questions; post-flight "watch disruptions" and post-project offers with decline cooldowns.
- **Phase 3 — Receipts provenance:** labels for the new watch/correction events; notification delivery receipts; journey disruption notices get audit rows; briefings keep prior versions (append, don't overwrite) with "corrected" traceability.
- **Phase 4 — Notifications unification:** Notifications settings section; priority levels mapped to push urgency + channel rules; per-category push/digest floors; deep-link audit of every sender; delivery/failure visibility on the card.
- **Phase 5 — Settings IA reorg** per section 5, with redirects from old group ids.
- **Phase 6 (later):** topic watches via periodic web-look search snapshots; work-desk context (FX for Money, industry watch for Projects); decide world_facts: wire it for country facts or drop the table.

## 9. Risks / regressions / privacy

- Today clutter: the radar card is one card, collapses to a line when quiet; attention budget unchanged.
- Spam: new signals inherit suppression (cooldown, quiet hours, budget); quiet checks never notify by construction.
- Never-claim law: card copy is generated from real watch rows only; no row, no claim; failed reads say "can't confirm," never "all clear."
- Scope: watches carry organization_id — every query must go through the active-scope filter; approvals never cross scope or device.
- Cost: watch-sweep cadence and SerpApi calls need the api_usage_logs budget treatment journey-watch already has.
- Privacy: topic watches store the goal text and public sources only; location-linked relevance stays opt-in via existing consent prefs.
- Renaming risk: "Awareness" surface (places) vs world-watching vocabulary — keep "watch/radar" words for world, "place" words for location.

## 10. Work-type split

- **Frontend-only:** radar card, WatchShelf upgrade, chat chips + source UI, Settings reorg, discovery copy, status rendering.
- **Backend/data:** watch lifecycle events, `paused` state, health signal kinds, briefing versioning, quiet-hours consolidation, notification priority mapping.
- **Scheduled/background:** watch-sweep extensions (health detection, later topic snapshots); cadence budget guardrails.
- **Notification plumbing:** urgency mapping, per-category floors, deep-link audit, failure_count fix.
- **External integration:** none new in Phases 0–5 (SerpApi/web-look already integrated); Phase 6 topic sources may add feeds.

## 11. Acceptance criteria (proves obvious, not buried)

1. Zero-watch signed-in user sees the radar card and its teaching state on Today with no menu diving (384px).
2. Asking "what's going on with Bangkok flooding" yields a sourced answer and a one-tap "Keep me updated" that creates a real `watches` row + receipt.
3. The card shows state, last successful check and next expected check; simulate a failed check — the card says failed, never silent.
4. A meaningful change surfaces on Today and (opted-in) as a push whose tap lands on the exact watch/briefing.
5. Quiet checks produce zero notifications and zero Today noise; Receipts still record them under "show all."
6. Notifications settings alone can configure push, quiet hours, Telegram, digest, per-category floors; no duplicate controls elsewhere.
7. Stop works from card, shelf and Ask, each leaving a receipt; declined offers don't reappear within the cooldown.
8. Full suite green incl. new reducer/copy tests; 384px Android pass; reduced-motion respected.

## 12. Remove / consolidate / rename in this cleanup

- Consolidate the 4+ quiet-hours implementations into one helper.
- Merge connection-health surfaces (SystemHealthLine + integrations page as the single home; retire duplicate status blocks in Connected Accounts and group sections).
- Fix then rely on push failure_count; delete dead `failure_count`-based guessing if superseded.
- Wire `SourceHealthStrip` into the radar card or delete the file.
- `world_facts`: wire for country facts in Phase 6 or drop the table then; until decided, no new code references it.
- One web-search path: route Ask research through `web-look` semantics, retire the duplicate gating.
- Rename internal docs/labels so `watches` (monitoring) and the wearable Watch page are never conflated; user-facing names stay as-is.

Recommended first cut: approve Phases 0–2 as one build (foundations + Today card + Ask front door). Approval sentence: "Build phases 0–2 of the awareness plan: watch lifecycle receipts and bug fixes, the Today radar card, and Ask follow-ups with sources — nothing else."
