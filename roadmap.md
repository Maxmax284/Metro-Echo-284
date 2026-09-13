# Consolidation + field-companion pass — status

## Brand law
- Product = Metro Echo. Intelligence = Echo. Owned by `src/lib/brand.ts` / `_shared/brand.ts`.
- **Frozen legacy identifiers (never rename — no user benefit, real breakage risk):**
  `vanta_*` database columns; `X-Vanta-*` signed webhook headers (outside platforms sign against
  these); the `vanta-converse` function name; `vanta-*` CSS classes; `vantaVoice` / `vantaIdentity` /
  `vantaSay` / `vantaBlocks` / `vantaNouns` / `vantaSignal` module names and their `VANTA_*` exports;
  `localStorage` keys prefixed `vanta.` (renaming wipes user settings); `sent_by: "vanta"` and
  `source_platform: "vanta"` wire/row values.

## Done (earlier)
- [x] 1. One action path (`_shared/actionStaging.ts` + `useStageAction`).
- [x] 2. One depth model + one urgency ladder (`responseDepth.ts`, `deviceCompression.ts`).
- [x] 3a. Telegram keeps its own conversation thread (`telegramConversation`).
- [x] 8. Provider names out of user-facing copy.

## This pass
- [x] Telegram calendar panel + tap-to-edit + multi-turn calendar draft retention.
- [x] A. Public identity cleanup: `@inbound.vanta` address, geocoder User-Agent + baked old URL,
      push tag, `ask_vanta` prompt/route token, cosmetic filenames, frozen-list documented.
- [x] B. One brain for Telegram: shared capability router, shared working context, shared transcript
      (`messages` canonical / `telegram_messages` transport-and-audit only), provenance on replies,
      shared file-intake schema, one outbound sender.
- [x] C. One place spine: single geocode/nearby owner mirroring `placeTruth` precision + freshness.
- [x] D. Trips as the shared cross-surface session: server-side trip owner, active-trip as shared
      state, Telegram can start/read/append/end the same trip, deep links carry session context.
- [x] E. Walk With Me as shared router capability + `walk_with_me` posture; `operationalState.ts` retired.
- [x] F. High-stakes groundwork: router recognition, simplified options, device dialer link,
      prepared-not-sent handoff. No sharing, no contacts, no execution.
- [x] G. Proactive field delivery through the existing awareness pipeline only, one sender.
- [x] Today hierarchy, Aware 384px proof, motion consolidation, Ask/widget continuity,
      and legacy route consolidation are complete.

## Parked deliberately
Background/always-on location. Geofencing. Autonomous SOS or emergency calling. Silent location
sharing. Trusted contacts / `location_shares` execution. Realtime public-safety or crime-risk
scoring. Always-on listening, voice-in-ear. A fifth room or new dashboard. Live location trails.

- [ ] Google Calendar per-user connection (App User Connector) — blocked: workspace Google client card was closed; user to decide connector vs secret iCal link.

## This pass (added)
- [ ] Platform-wide verdict delivered (East Coast tone, no code change).
- [x] Dani invite follow-up dropped from active scope at Maxwell's request.
- [x] Guest invites on the shared calendar spine: attendee field, email validation,
      Google attendees + sendUpdates=all, existing-guest merge on updates, high-risk
      double-confirm (Google emails a real person). Telegram + Ask tool schemas updated.
      874 tests green. Dani's event still needs her email, then approve in Telegram.

## Simplification pass 1 — quick wins (approved plan: metro-echo-simplification-audit-and-roadmap-2026-09-11)
- [x] One interaction vocabulary: `src/lib/interactionVerbs.ts` (Not now / Later / Handled /
      Hide / Archive / Delete / Clear settled) + tests. `vantaSignal.ROUTE_LABEL` now reads
      its labels from it. Retired "Dismiss"/"Snooze"/"Ignore" from Today's noticed row,
      nudges, the file tray and commitment rows; a commitment cancel now says "Cancel it"
      because it really cancels.
- [x] Today copy pass: "Fresh in" -> "Just landed", "Happening now" -> "Right now",
      "Needs attention" -> "Needs you", "Next up" -> "Coming up", "What changed" -> "Changed",
      human empty states and loading lines. Expand all / Collapse all sweep deleted.
- [x] Work rebuilt as three stable shelves: Coming in / In motion / Echo noticed.
      Numbered tier tour removed, duplicate "Where things stand" heading removed,
      empty countable desks hidden behind one quiet line with one way in.
- [x] Desk labels de-jargoned: Inbox -> Just arrived, Commitments -> Promises,
      Actions -> Waiting on you, Sherlock -> What Echo noticed, Awareness -> Place and
      context, Memory -> Find something.
- [x] Cockpit (`command`) removed from `ADVANCED_SURFACES` — still reachable by deep link
      and legacy `?surface=cockpit`, no longer offered as a place to go.
- [x] Receipts front layer: `src/lib/receiptDigest.ts` (pure, 7 tests) + `ReceiptsFront.tsx`.
      Receipts now opens with six human lines — what happened / what Echo did / what you
      approved / what failed / what Echo held back / what changed outside Echo. Filters,
      action lifecycle, held-back panel and the raw audit rows sit behind "Show the record";
      a deep link from an action card opens the record directly. Lines drill into the record.
- [x] Today cut to three shelves: Just walked in / On the move / Echo caught this.
      Sections retitled in street terms (Waiting on your yes, Up next, Locks and alerts,
      What moved). Travel + Tasks folded into On the move instead of owning lanes.
- [x] Briefs are project outputs, not a desk: removed from the desk strip, Work tiles and
      ADVANCED_SURFACES; project page section renamed "What this project puts out";
      `/?surface=briefs` still opens (old links, receipts) but reads as a list of what
      projects put out with one door back to Projects.
- [x] Today location relevance: a place no longer appears merely because Today has
      unrelated lines or nearby content. It speaks only for a real move, active trip,
      clock drift, or when place changes a near-term calendar answer.
- [x] Route cleanup — the seven side pages now live behind one door (`/how`), old links redirect
- [x] Ask <-> widget continuity: half-typed drafts and live streams follow you from the
      quick panel into the Ask room (`adoptAskSession`); the panel closes itself in Ask.
- [x] Aware at 384px: no page overflow; add-a-place form now opens on request instead of
      sitting empty at the top; machine-stamped pins read "Spot - Aug 29, 4:47 AM"
      (`src/lib/placeLabels.ts`) instead of truncating into nonsense.
- [x] Motion consolidation: one fade (`MOTION_FADE` / `.motion-fade`, Feel-aware and
      reduced-motion aware) replaces Tailwind's `animate-fade-in`, which is deleted from
      the config. Guard test blocks raw `duration-*` and `animate-fade-in` in app code.
- [x] Simplification pass 2: Today now reads Current read / Needs you / Coming up / Changed;
      duplicate travel/checklist presentations are removed. Work exposes three shelves with
      one tap per destination. Empty Awareness shelves stay hidden; deeper place tools sit
      behind one reveal. Ask, Receipts, setup warnings and navigation use plain language.
      Four-room navigation is the only primary navigation on phone and desktop.
- [x] Echo's reach, phase 1 — three connection words. `src/lib/reach.ts` collapses every
      connection state into Connected / Available / Needs you; red belongs to Needs you
      alone. `needsYou()` only fires when a source is switched on or already in use and
      something it needs is missing (or the last attempt failed), so an optional
      integration nobody ever turned on no longer shows up as a failure on Today.
      Connection plumbing (webhook address, keys, signature diagnostics, test) now sits
      behind one "Wiring and keys" door on each card.
- [x] Echo's reach, phase 2 — universal capability contract. `contractFor()` reads
      See / Understand / Prepare / Act / Watch / Report off the registry entry each source
      already has, with Authority (see -> prepare -> act) and Presence (when I ask /
      keep an eye on it) underneath and plain-English copy on top. Read-only and
      inbound-only sources can never gain Act. CampStay (LMT Camp State) is represented
      through this contract with its signed inbound path, dedupe, diagnostics, judgment,
      approvals and receipts untouched; no old setup path has been retired.
- [x] Echo's reach, phase 3 — Google is one account. `src/lib/googleEcosystem.ts` +
      `GoogleAccountSection` present a single Google account container with each service
      as its own explicit permission. Calendar is the only wired capability and keeps its
      exact current behaviour and scopes; Gmail / Drive / Contacts / Tasks are listed as
      "Not built yet" with the honest reason and the scope they would need. Signing in
      grants nothing on its own. No reconnect required for the connected account.
- [ ] Echo's reach, phase 4 — first-party account linking (CampStay/CampCore/Fenrir).
      Blocked outside this repo: those products expose signed webhooks only, no
      per-user sign-in or token endpoint to link against.
- [ ] Echo's reach, phase 5 — durable watch object ("keep checking until the deposit lands").
      Genuinely new primitive: needs a table, a cadence runner and Work -> In motion
      rendering. Not started; deliberately not half-built.
- [ ] Echo's reach, phases 6-9 — CampStay write-back, cross-source reasoning, legacy
      removal, logged-in browser work. All wait on 4 and 5.

## Watch primitive (Phase 5, 2026-09-12)
- Live: watches table, watch-sweep, Work > In motion shelf, "Keep an eye on it" on approved actions, receipts via audit_log.
- [x] Real clock: pg_cron job `vanta-watch-sweep` every 10 minutes (drizzle/migrations/0016).
      The sweep claims each due row by writing a 5-minute lease into `next_check_at`
      (`leaseUntil`), so two overlapping runs can never check the same watch twice; the
      real next check time is written when the check finishes. Read-only by construction:
      it reads `actions` / `calendar_events` and writes only the watch row and an audit
      event. Terminal states (done / couldn't finish / needs you) always emit
      `watch.<state>` through `writeAuditEvent`.
- [x] Fingerprint is change-shaped, not feed-shaped: title (trimmed, case-folded) plus
      start and end at minute precision. Seconds churn and casing are not news.
- [x] Ask + Telegram speak it: `keep_an_eye_on` / `stop_watching` / `whats_being_watched`
      on both tool lists, both landing in the shared `_shared/watchApply.ts` (mirrored to
      the client as `src/lib/watchApply.ts`). Same watch row, same Work > In motion shelf,
      same receipts. Subject resolution reuses `calendarResolve`; one clarifying question
      when several entries tie; saying it twice does not start a second watch.
- [x] Calendar watch creation in the app: an eye button on `AgendaRow` ("Tell me if this
      moves") wherever the row is already actionable. No calendar-monitoring page.
- [x] Proven live end to end (2026-09-13): a watch started from Ask, a scheduled sweep that
      stayed silent when nothing changed, a real time move detected on the next sweep, a
      `watch.done` receipt, and the outcome reading on Work at 384px.
- [x] Identity is the feed's own `uid`, not the database row id: calendar sync replaces rows,
      and a replaced row must never be reported as "gone". A single empty look is a miss, not
      news — the sweep waits two consecutive misses before saying an entry disappeared.
- [x] Outcome lines speak human time in the person's own zone (`humanWhen`), never an ISO stamp.
- [x] A finished watch stays on the shelf for a day with what it found ("It moved: … now runs
      Mon, Sep 14, 7:00 PM"), with Clear settled to put it away. Clearing removes the card,
      never the receipt.
- Open: nothing on the watch object itself.

## Echo's reach, phases 4-9 — status after the watch clock
- Phase 4/6 (CampStay account linking + approved write-back): blocked outside this repo.
  CampStay/CampCore/Fenrir currently expose signed inbound webhooks only — no authorize,
  token, refresh or write endpoint to call. Metro Echo's side needs their contract first,
  so nothing is stubbed as "connected".
- Phase 6 (Google Gmail/Drive/Contacts/Tasks): the one-account shell and scope display are
  in place; enabling any of them needs the workspace Google connector to actually grant
  those scopes. Until then they stay honestly marked "Not built yet".
- Phases 7-9 (cross-source reasoning, legacy removal, logged-in browser work) wait on real
  second sources landing from 4 and 6.
