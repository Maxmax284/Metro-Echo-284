# Metro Echo — Phase 0 Audit & Phased Plan

AUDIT → VERIFY → CONNECT → SIMPLIFY → HARDEN → EVOLVE. No code edited. Every claim below is repo- or database-verified this turn.

## A. EXECUTIVE REALITY CHECK

Metro Echo today is **a working situational companion with a strong spine and honest weak spots** — not the full HUD the doctrine describes, but far more than a chatbot.

What is genuinely real: four rooms on one shell with URL-backed navigation; a live watch/Radar system sweeping every 10 minutes with hourly instrument telemetry; a dual-brain Echo (GPT-6 Astra conversation, Gemini pre-pass/sweeps) genuinely shared between the app and Telegram; a Documents chain that drafts, reviews, and exports with receipts; an approval-gated execution model that holds everywhere we looked; a boot ceremony that is the one place in the app that is honest about having no signal.

What is not real yet: the offline doctrine (the service worker is push-only by design; there is no write queue; stale data wears no label outside boot); the Today→Echo handoff (the biggest door into Echo passes raw text, and the backend resolves only 2 of 11 context kinds into real records); native Android (Capacitor is installed and configured but no native bridge is wired — an Android build today loses push entirely); and the repo's ability to describe its own backend (12 of 17 live cron jobs exist only in the database, in no migration file).

The machine is alive. The gaps are connective tissue and honesty labels, not missing organs.

## B. ARCHITECTURE MAP

```text
CLIENT (React 18 / Vite, 384px-first)
  4 rooms: Today / Work / Echo / Receipts  (+8 desks under Work, 2 zombie surfaces)
  Providers: Auth, Scope, Workspace, VantaContext, Awareness, AskThread,
             Companion, Sherlock, Entity, Canvas, Activity, Tutorial
EDGE (89 functions, Lovable Cloud)
  Brain:      vanta-converse (+ _shared/echoReads, routingRules, responsesChat)
  Ingress:    telegram-webhook, email-inbound, *-inbound webhooks
  Sweeps:     watch-sweep, weather-tick, gmail-sweep, calendar-sync,
              drift-sweep, commitment-reminders, sherlock-*, physical/wearable
  Documents:  intake → draft → review → extract → export
DATA (Supabase)
  watches, audit_log (receipts), notes/messages/files, commitments, actions,
  calendar_*, awareness_places, entities + TWO linking graphs (cross_links,
  entity_relations/entity_links), organizations (workspace scope)
CRON: 17 jobs LIVE in the database; only 5 recorded in repo migrations
PROVIDERS: Open-Meteo (instruments), SerpApi (web), Lovable AI gateway
           (GPT-6 Astra + Gemini 2.5 flash/flash-lite), Google (Gmail/Calendar),
           Telegram, Wikipedia (place photos), web push (VAPID)
```

## C. CAPABILITY MATRIX (condensed to what matters)


| Capability                                                                 | Status                                | Evidence / note                                                                                                                                               |
| -------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Watch lifecycle (create→sweep→sitrep→UI→stop/expiry→receipts)              | **LIVE**                              | `watch-sweep/index.ts`, cron */10, lease + cadence backoff, `watch.checked` receipts even for quiet checks                                                    |
| weather-tick hourly instruments                                            | **LIVE, failure-invisible**           | cron `7 * * * *`; failures returned in HTTP response only — no receipt, no nudge                                                                              |
| Weather system                                                             | **LIVE, one engine**                  | Open-Meteo only; but fetch + `codeLabel` implemented twice (`_shared/weatherRead.ts` vs `weather-station/index.ts`), `LIVE_FIX_SOURCES` copied 3×             |
| Echo pipeline (context→pre-pass→reads→Astra→stream)                        | **LIVE**                              | 30 msg flat history, keyword file gating, no token budget                                                                                                     |
| Telegram↔app shared brain                                                  | **LIVE**                              | same `_shared` modules, same Astra client, same ingested_files store; execution boundary holds                                                                |
| Documents chain                                                            | **LIVE**                              | intake sieve, review JSON schema, approval gate, PDF/DOCX export, `document.*` receipts                                                                       |
| Sherlock                                                                   | **LIVE**                              | Gemini flash, citation-tagged findings, cache + digest + patterns                                                                                             |
| Awareness evaluate pipeline                                                | **LIVE (corrected)**                  | agents found no cron in repo — but `vanta-drift-sweep` runs hourly in the live DB; `awareness.evaluated` fired 58×/14d. Proactive layer is real but low-yield |
| Notification ladder (floors, quiet hours, receipts)                        | **LIVE**                              | `reach.ts` + `notifyPolicy.ts`; BUT `commitment-reminders` + `drift-sweep` call `sendWebPush` directly, bypassing the "one place" floor gate                  |
| Push (web)                                                                 | **LIVE**                              | VAPID, diagnostics, dead-subscription hygiene                                                                                                                 |
| Push (native Android)                                                      | **GAP**                               | Capacitor plugin installed, zero wiring                                                                                                                       |
| Offline                                                                    | **GAP (by design so far)**            | sw.js is push+share-target only; no shell cache, no write queue, no staleness labels outside boot                                                             |
| Today→Echo context handoff                                                 | **MISSING CONNECTION**                | `AskVantaBar` bypasses `openAskWithContext`; backend resolves only `nudge`/`watch` of 11 context kinds                                                        |
| Inbox vs Memory surfaces                                                   | **DO NOT DUPLICATE (violation live)** | both mount `CapturesView` + `MemoryFilesView`                                                                                                                 |
| ConversationSurface vs CompanionWidget; SherlockSurface vs SherlockOverlay | **MISSING DECISION**                  | two chat UIs, two Sherlock UIs over same state                                                                                                                |
| `command` + `briefs` surfaces                                              | **ORPHANED (zombie rooms)**           | mounted, routable, zero entry points                                                                                                                          |
| intake-digest, entity-resolve, cadence-sweep                               | **DEAD/ORPHANED**                     | no cron in DB, no client caller                                                                                                                               |
| AwarenessHUD trust tiers                                                   | **PARTIAL**                           | keyword string-matching source names; Sherlock full-mode is the only structural inference-vs-fact label                                                       |
| Cross-model fallback                                                       | **GAP**                               | one gateway outage kills both brains; SERPAPI_KEY missing degrades silently                                                                                   |


## D. ONE-STATE / FOUR-VIEWS AUDIT

Shared well: scope (`useScope` everywhere), place (`AwarenessProvider` + single `placeTruth()`), threads (`AskThreadProvider` shared by dock and room), room signals (one poll feeds both nav rails), workspace identity, weather (one engine, one unit state).

Diverges: Inbox/Memory fetch the same rows independently; `WorkSurface.refresh()` re-queries counts that `useRoomSignals` separately polls; `WatchDispatchSheet`'s live-sky card reads the *active* ground instead of the watch's resolved place (wrong sky for a non-local watch); Echo's heads-up block is label-only for 9 of 11 context kinds, so Echo and Today can hold different depth on the same object.

## E. DEAD / ZOMBIE / ORPHAN AUDIT

- Zombie rooms: `command` (35KB CommandCenterSurface) and `briefs`, URL-reachable only.
- Dead functions: `intake-digest` (writes AI digests onto user notes with no receipt — worst kind of dead), `entity-resolve`, `cadence-sweep` (no cron in live DB, no client call).
- Orphaned routes: legacy wearable/physical/glance redirects (kept deliberately for old links — acceptable); `/awareness/location` has no discovered in-app link; `/weather` entry points need one verification pass (chips link with `?place=` but the bare route may be unlinked).
- `usePwaInstall` is dead code inside a Capacitor shell (harmless).
- Stale docs: `.lovable/architecture-audit.md` #1 (receipts/audit duplicate) already fixed in code; `.lovable/backend-consolidation.md` "127/127 passing" predates the current ~2,419-test suite.

## F. DUPLICATION AUDIT

1. `LIVE_FIX_SOURCES` — 3 verbatim copies (`placeMove.ts`, `_shared/weatherRead.ts`, `weather-station/index.ts`). Drift risk on a security-adjacent constant.
2. Open-Meteo fetch + `codeLabel` — 2 implementations.
3. `liveBlock` sitrep reassembly — 2 implementations sharing a brittle `"\nAdvisory: "` string contract.
4. `WeatherStation.tsx` hand-rolls the grounds fetch instead of `useGroundsWeather()`.
5. Two linking graphs (`cross_links` manual vs `entity_relations` auto) — deliberate per comments, but no stated reconciliation; needs a documented boundary, not a merge.
6. `sendWebPush` called directly by 2 sweeps, bypassing `reach.ts`.
7. `commitment-reminders` vs `reminder-send-now` — duplicated auth/rate-limit/audit boilerplate around the same send path.
8. Two migration trees (`supabase/migrations` 71 files, `drizzle/migrations` 49) + out-of-band tool-applied jobs = three sources of schema truth.
9. `awareness-decay` uses a pinned, non-canonical supabase-js + wrong cors import (known leftover).

## G. COMPREHENSION AUDIT

- Receipts search box matches raw `entity_type`/stringified `payload` — unexplainable matches in user terms.
- `ActionsSurface` can render raw executor kinds (`webhook`, `google_calendar`) as labels.
- `BriefsSurface` is a dead-end-by-design screen for old bookmarks.
- Work's "Echo noticed" fold can say "nothing yet" while unconditionally rendering `DriveFindPanel`.
- `deliver.ts` header comment ("only today is live") contradicts its own `liveChannels()` capability — internal, but the kind of comment that misleads the next build.
- `weather-station` failure copy ("a failed read, not a weather report") is the gold standard — extend that pattern everywhere.

## H. SOURCE / TRUTH AUDIT

Strong: research blocks carry structural authority/freshness/corroboration (`orchestration/research.ts`); weather failure is never dressed as a forecast; stamps are deliberate and receipted; live-fix sources outrank saved readings (Fairfax bug fixed previously and holding); quiet checks still write receipts.

Weak: (1) in-stream `grounding.sources` is file-only — a web-lookup-justified action can present with the same provenance shape as a file-cited one; (2) AwarenessHUD tiers are keyword heuristics on source names; (3) cached/stale has no label outside boot — last-known masquerades as current in Work/Receipts/Documents/Echo; (4) awareness-decay expires field notes/corrections with zero receipt (silent state mutation).

## I. OFFLINE / PWA AUDIT

Works today: honest boot (`NO SIGNAL`, never `ALL CLEAR` offline), `useNetworkReach` (flight telemetry + boot only), share-target stash, push display, in-memory state surviving a dropped connection in an open tab.

Does not: no app-shell precache, no runtime caching, no persisted React Query cache, no offline write queue (a capture attempted offline just rejects — no retry), no reconnect reconciliation, no staleness markers in Work/Receipts/Documents/Echo, AuditSurface doesn't even import `ErrorState`. Doctrine text exists (`useNetworkReach.ts:3-9`) but is implemented in exactly one component family.

## J. FAILURE-STATE AUDIT

Good: gmail-sweep holds 12h on 403 and re-bootstraps on 404; watch-sweep misses→`couldnt_finish` with human-readable outcomes; push dead-subscription cleanup; bridge-dispatch has real retry/dead-letter (`outbound_bridge_deliveries`); typed provider errors (rate_limited/budget_exceeded/provider_disabled).

Missing: no retry/backoff anywhere except bridge-dispatch; no leases on 5 cron functions (overlap = duplicate sends possible); weather-tick + awareness-decay + intake-digest fail silently; empty-answer guard absent in vanta-converse; dropped streams end quietly (deliberate, but client should mark the turn incomplete); no cross-model fallback.

## K. ANDROID-READINESS AUDIT

Ports well: pure logic modules (bootSequence, station, occasions), shared edge-function brain, remote-URL Capacitor shell already configured.

Browser-bound/blockers: web-push stack (VAPID) will not work in a WebView — FCM via `@capacitor/push-notifications` is installed but never registered; `swAllowedHere()` host-gating; `usePwaInstall` relies on `beforeinstallprompt`; `localStorage`-only persistence (no `@capacitor/preferences`); geolocation uses browser API (no `Capacitor.isNativePlatform()` branch found). Bridge points to protect: `push_subscriptions` (add a `platform` column concept later), `useNetworkReach`, the shared `_shared` brain.

## L. TEST / OBSERVABILITY AUDIT

~2,419 tests across 254 files, but vitest only covers `src/**` — **no edge function entrypoint is tested**; watch-sweep, weather-tick, wearable/physical-sweep, bridge-dispatch, sherlock-digest have zero coverage by name (their `_shared` pure logic partially is). Telegram is the deepest-covered area (28 files). No observability on sweep health beyond passive `telemetry_at` timestamps.

## M. ROADMAP CORRECTION

- `roadmap.md` top item "Telegram capture bridge" — STALE (shipped; summary persistence + arrivals lane live).
- weather-tick/weather-station items — accurate but silent that cron lives only in `drizzle/migrations`.
- Parked Phase 7 — correctly parked.
- Neither roadmap nor consolidation doc discloses the 12 out-of-band cron jobs or the 3 dead functions.

## N. PHASED IMPLEMENTATION PLAN

### Phase 1 — Repair (dead / partial / missing connections)

1. **Record reality: cron jobs into migrations.** Why: 12 of 17 live jobs exist only in the DB; the repo cannot describe its own backend. Owner: `supabase/migrations` (single tree going forward). Must NOT create a third migration tree. Acceptance: every `cron.job` row in the DB has a matching repo migration; drizzle tree marked legacy. Risk: low — `cron.schedule` same-name is idempotent-replace.
2. **Wire the Today→Echo handoff.** Route `AskVantaBar` through `openAskWithContext`, and extend vanta-converse's heads-up block to resolve real records for project/document/commitment/action/receipt/note (it already does nudge/watch). Why: the doctrine's #1 sync rule is broken at the biggest door. Owner: `useAskContext` + `vanta-converse`. Must NOT build a second context channel. Acceptance: tapping "Handle this" on a Today object lands Echo with the object's real data in the prompt; test per kind. Risk: low, additive.
3. **Route all push through `reach.ts`.** commitment-reminders and drift-sweep call `sendWebPush` directly. Why: the floor gate is law and two functions bypass it. Owner: `_shared/delivery/reach.ts`. Acceptance: zero direct `sendWebPush` imports outside reach.ts; held items leave receipts. Risk: low.
4. **Receipts for silent mutations.** weather-tick failures, awareness-decay expirations, intake-digest writes. Owner: `_shared/auditEvent.ts` (already the canonical writer). Acceptance: every state change emits an event, visible in Receipts. Risk: trivial.
5. **Fix WatchDispatchSheet sky card** to pass the watch's resolved `place_id` to weather-station. Acceptance: a Bangkok watch opened from Samui shows Bangkok's sky. Risk: trivial (param already exists).
6. **Kill or wire the dead.** Delete `intake-digest`, `entity-resolve`, `cadence-sweep` (or schedule cadence deliberately); remove `command`/`briefs` surfaces with URL redirects to their owners. Acceptance: no callable surface with zero entry points. Risk: low — redirects preserve old links.
7. **Consolidate constants/fetches.** One `LIVE_FIX_SOURCES` export, one Open-Meteo fetch + `codeLabel` + `liveBlock` in `_shared/weatherRead.ts`, `WeatherStation.tsx` uses `useGroundsWeather`. Risk: low, behavior-identical.
8. **config.toml parity** for calendar-sync, awareness-decay, sherlock-digest, weather-tick verify_jwt entries. Risk: low.
9. **Stale-data labels outside boot.** Add a `reachNow()`-driven stale/offline chip to Work, Receipts, Documents, Echo (extend `state-views`, import `ErrorState` in AuditSurface). Why: doctrine says last-known must not masquerade as current. Acceptance: airplane-mode walkthrough shows a label in all four rooms. Risk: low.

### Phase 2 — Comprehension & interaction clarity

Plain-English Receipts search; label maps for executor kinds; resolve Inbox vs Memory (one landing, one search — declare the split in code, not comments); one Sherlock door (overlay) with the surface as its full-page view or vice versa; fix the "nothing yet"/DriveFindPanel contradiction; document the two linking graphs' boundary in AGENTS.md; update stale audit/consolidation docs and roadmap.

### Phase 3 — Offline / resilience hardening

App-shell precache + runtime cache in sw.js (versioned); persisted React Query cache for read-mostly rooms; offline write queue for captures/notes/incidents with "Saved on device — will sync" receipts distinguishing created-offline vs synced; reconnect reconciliation ("Back online — 3 things changed"), never a stale-notification blast; offline Today posture (NOW/NEXT/SAVED/EMERGENCY from cached truth with freshness labels). Extend, never parallel-build: one queue module, one cache strategy, one reach hook.

### Phase 4 — World model / literacy / source expansion (only proven gaps)

Structural source-tier tags (replace AwarenessHUD keyword matching); extend `grounding.sources` beyond files to web/calendar provenance; token-budgeted context assembly with thread compaction; cross-model fallback (Astra→Gemini) with honest degraded voice; SERPAPI-missing surfaced distinctly; low-yield drift sweep tuned or its cadence made adaptive. Human-literacy features only after these.

### Phase 5 — Android field capabilities

Wire `@capacitor/push-notifications` (FCM) into `push_subscriptions`; `@capacitor/geolocation` behind the existing location-source abstraction; preferences bridge for localStorage; keep the remote-URL shell; local-brain-survival/cloud-brain-depth split stays doctrine.

---

**STOP.** No implementation until Maxwell approves a phase. Suggested first approval: Phase 1 items 1–9 as one build batch (all small, all verified-diagnosed, zero new surfaces).

&nbsp;

"I approve this start only with phase one for now" because we need to know that everything is good to go before we continue on to the other phases and I do need you to inspect it afterwards after phase 1 implementation