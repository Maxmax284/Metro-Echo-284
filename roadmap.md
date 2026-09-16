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
- [x] Phase 6 (approved write-back), Metro Echo's side is built and provider-agnostic:
      `_shared/firstPartyWrite.ts` + executor kind `first_party` (migration 0018). Flow is the
      existing spine — propose, stage, approve, write, provider confirms, receipt. A write only
      counts when the provider answers with `ok: true` and its own id; a vague 200, a missing
      id, an error status or an unreachable host all become a failed receipt and nothing is
      marked done. Every attempt carries `Idempotency-Key: action:<uuid>`, so a retry after a
      timeout cannot double-book, double-charge or double-cancel. Unwired provider =
      "can receive updates but cannot make changes yet", never a fake connection.
      CampCore and Fenrir plug into the identical contract via `CAMPCORE_WRITE_*` /
      `FENRIR_WRITE_*`. Contract for the other side: `.lovable/campstay-outbound-contract.md`.
- Phase 4 (per-user account linking) still blocked outside this repo: CampStay/CampCore/Fenrir
  expose signed inbound webhooks only — no authorize, token, refresh or `/me` endpoint. The
  three endpoints they must expose are written down in the contract doc. Waiting on:
  `GTH_WRITE_URL`, `GTH_WRITE_SECRET`, optional `GTH_WRITE_TOKEN`.
- [x] Phase 6 (Google, one account with real services): Gmail and Drive are wired for real
      per-user consent, not shelf display. `_shared/appUserScopes.ts` keeps each consent to one
      product plus who you are — granting mail never touches calendar, and permission to send
      mail is a separate grant from reading it. `app-user-oauth-start` /
      `app-user-oauth-complete` now take a connector id, and every connection key is stored
      encrypted per person (`app_user_connections`). `google-account-status` reports each
      service on its own; a workspace connection may keep calendar reads working but never
      renders as "you are connected". `google-disconnect` revokes one service and leaves the
      others alone.
      Mail: `gmail-read` returns one conclusion ("Dani is waiting on a reply"), never a card per
      message; `gmail-draft` saves a draft freely, and a send needs an explicit confirmed yes
      plus the send grant, with a receipt either way. Echo can offer a starting point only when
      a person taps for one, and the words on screen are the words that go out.
      Drive: `drive-find` lists names and dates (browsing, not reading); `drive-read` reads one
      named file per yes and records it. No write scope is ever requested.
      Contacts was dropped rather than shown as a button that cannot work. Tasks stays honestly
      marked "Not built yet".
- Open on Google: Tasks. Gmail/Drive need the workspace App User Connector client to allow those
  products; until an owner does, the card says an owner has to allow it instead of failing.
- Phases 7-9 (cross-source reasoning, legacy removal, logged-in browser work) wait on real
  second sources landing from 4 and 6.

## Explanation page + reach status (2026-09-15)
- [x] Public origin page at `/what-is-metro-echo`, linked from Sign in / Create account
      ("What is Metro Echo?"). Not a hero page: chaos → understanding → calm.
      Sections: chaos field, why it exists (founder line, city/timezone nodes), what it is
      (five questions + one-Echo promise), live cross-source weave, "not another chatbot",
      See→Understand→Prepare→Act→Watch→Report, silence, surfaces, day simulator,
      everyday-life + safety framing, honest future list, "what it is not", closing.
      Future capabilities are labelled (`planned` / "Where Echo is going") — no fake claims.
      Reduced-motion honoured, 384px verified, no horizontal overflow.
- [x] Gmail, Drive and Calendar connected overall on the per-user Google rail.

## Next active priorities (in order — do not reorder, do not replace)
1. [x] Cross-source reasoning: `_shared/crossSource.ts` reads recorded facts (calendar,
       commitment, mail header, file, change) into one situation — strongest recorded link
       wins, at most three clauses, conclusion first, provenance behind "Why this?". A new
       fact is absorbed into the existing situation instead of starting a second pile; thin
       reads never surface unasked. Ask composes one answer for mail/Drive searches via
       `src/lib/crossSourceAnswer.ts` instead of a per-source dump. Today rewords the line it
       already has (no new lane) and the "On now" lane deduplicates a stay carried by two
       feeds. Recorded rows only — Today never spends a provider read to load.
2. [x] Browser / website work (2026-09-15): reading only, and it is a hand, not a room.
       `_shared/webLook.ts` (pure: public-address guard that refuses localhost / LAN /
       non-http, HTML→text, word-level fingerprint that ignores whitespace and tracking
       junk, login-wall detection, diff wording, source line) + `_shared/webFetch.ts`
       (the one outbound page read: 12s timeout, 1.5MB cap, no cookies, no forms, no
       POST) + `web-look` edge function with three modes — read one page the person
       pointed at (answered against their question, conclusion first), search the public
       web through the existing SerpApi leash, or watch a page. Every call runs through
       `apiGuard` (`web-page` provider mapped to the external-APIs kill switch, cached
       reads, per-task caps, usage logged). Ask gained `check_page` and `look_up`, ordered
       after the person's own calendar / mail / files, allowed in observer mode because
       both only read. `watches.kind` now allows `web_page`; `watch-sweep` re-reads the
       page, stays silent when nothing moved, and on a real change reports one plain
       sentence as a `web_page_changed` nudge (deduped per page per day) into Today plus a
       `needs_you` watch state and a receipt. Three unreachable checks retire the watch; a
       page that turns into a sign-in wall ends it honestly.
       Dependency documented: there is NO headless browser runtime and no logged-in
       browser work. Echo cannot sign into a portal, submit a form, book, cancel or pay on
       the web. That step needs a real browser-automation provider (or Firecrawl-class
       fetch with session support) plus an approval gate before it is anything but a
       promise. Not faked in the meantime.
 3. [x] Connection / reach polish: CampStay, CampCore, Fenrir and existing first-party sources
        under the same See→Understand→Prepare→Act→Watch→Report model. No Integrations centre.
        Done: an inbound signal at time-sensitive or above now raises ONE notice on Today
        (kind inbound_needs_you, priority 70, critical 85) alongside the Telegram reach it
        already had. Identity is the sender's idempotency key, so app + Telegram are one
        notice on two surfaces and a retried webhook cannot stack. Boring signals stay
        silent (below threshold), shadow mode stays silent, and a notice failure can never
        fail the webhook — the capture has already landed. Notice body carries only the
        facts the payload sent, plus "Nothing was actioned."
        Owner self-test can now rehearse a real event shape (payment.failed, urgent guest
        message), not just the background test ping.
        Verified live end to end on LMT Camp State: payment.failed → noticed true, one row,
        renders in Today's "Needs you" lane at 384px and desktop, zero overflow;
        integration.test → noticed false.
        Still waiting outside this repo: CampCore and Fenrir have no webhook secret stored
        yet, and none of the three expose per-user sign-in (see phase 4 below).
4. [x] Reminder / awareness polish — DONE. The engine already treated a calendar_event watch as
       explicit intent (speaks evening + day-of even for a boring title, even when Google keeps the
       day-of alarm), but nothing in the interface could create one. Added a per-entry bell:
       `src/lib/remindMe.ts` (subject = uid ?? id, matching eventKey(); goal "Remind me about X";
       stop_at = start + 1 day so no watch leaks) and `RemindMeButton.tsx`, wired into
       CalendarOnlyView and WeekPlanner on every timed entry, feed or Echo's own. Taking it back
       closes the watch with an outcome line, never deletes the receipt.
       Fixed while verifying: subject_id is a uuid column, so a subscribed feed's uid
       ("...@google.com") could never be stored — identity now lives in success_when.uid (where
       watch-sweep already read it) and subject_id only carries rows Echo owns. awareness-drift-sweep
       and watch-sweep read the same identity; both deployed.
       Verified live at 384px and desktop: bells render, one tap flips to "Stop reminding", the watch
       row persists, zero overflow, no console errors. Test watch cleaned up afterwards.
       No duplicate spam, no new room, Telegram still only the fallback pipe.
5. [x] Continuity: "Three things changed while you were out", never "27 unread". DONE.
       `src/lib/whileYouWereOut.ts` (pure, 8 tests): a gap only counts between 4 hours and
       14 days, changes rank by consequence (meeting changed > needs you > waiting on your yes
       > arrived > already handled) then recency, three spoken lines maximum and the rest is
       counted ("2 more changes are on the record"). Gap words read against the hour you came
       back, so an 8-hour night says "overnight" and a morning-to-evening day says "while you
       were out". Captures and completed work are counted, never listed.
       `useWhileYouWereOut` keeps a per-scope presence heartbeat in localStorage (written every
       minute while the tab is visible, and on hide), freezes the value read at mount so the
       heartbeat cannot erase the gap it is describing, and reads calendar_changes, pending
       nudges, staged actions, new notes and audit receipts since that moment — all scope
       filtered. "Caught up" acknowledges that one gap and does not return on refresh.
       `WhileYouWereOut` renders one card at the top of Today's body; each line is a door into
       the room that owns it; nothing changed means the card never appears.
       Verified live signed-in at 384px and 1280px: "Two things changed while you were out"
       with the two real pending notices, zero overflow, no new console errors.
 6. [x] State compression: open / changed / waiting on you / can wait / already handled — DONE.
        `whereYouStand()` + `formatStand()` live in `_shared/workReads.ts` next to the existing
        whats_waiting / whats_due / whats_changed reads, mirrored to the app through
        `src/lib/workReads.ts`, so Ask and Telegram answer from ONE implementation and can
        never drift. Five buckets from real records only: waiting on your yes (staged/proposed
        actions + inbox items without a lane), open (overdue + promises dated inside the week,
        overdue counted separately so it is never double-spoken), moved today (calendar changes
        + captures in the last 24h), can wait (open with no date or dated past the week),
        already handled (promises closed + actions executed in the last week). One "Start with:"
        line — never a list. No score, no dashboard, no new room.
        Exposed as the `where_do_i_stand` tool in `vanta-converse` and `telegram-webhook`
        ("where do I stand", "catch me up", "what actually needs me"), read-only, and listed in
        Ask's read-only intents so it is never described as a draft awaiting approval.
        Today keeps its existing compression (headline + `stateOfDay`) and now shares the same
        bucket vocabulary; nothing new was added to the room.
        Fixed while verifying: read-only answers were inserted into the most recently touched
        conversation, so an Ask question could land in the Telegram thread and the asker saw
        nothing. The answer now goes to the thread that asked.
        Verified live at 384px: "Where you stand: 6 things waiting on your yes and 2 promises
        open this week. 2 things already handled in the last week. Start with: …", zero
        overflow, no console errors. 1136 tests green across 124 files, typecheck clean.
7. [x] Surface continuity prep only: phone main, watch glance, desktop deep, earbuds later,
       glasses much later. Hygiene pass, no wearable future built.
       Three real seams were leaking. `handoff()` stamped the arriving body as coming from
       "unknown" whenever that body had no idea what it was before, quietly erasing the body the
       hand-off actually came from — it now keeps `lastDeviceClass` and only falls back to
       "unknown" as a last resort. `bodyForDevice()` sent the ambient (glasses-class) body to desk
       depth, i.e. a paragraph in your eyeline; ambient now reads at wrist depth. The wrist left
       no trace at all: noting, deferring, closing or capturing on the watch now writes a
       hand-off pointer (step + label + surface, via useHandoffTrace), so the phone can say
       "you were on X on your watch". Pointer only — approval still never travels.
       New invariants locked in src/test/surface-continuity.test.ts: every device class maps to a
       real depth, small bodies glance / spoken bodies speak, arriving bodies never erase the
       previous one, device-local facts never persist, and resume never crosses scope.
       Deployed vanta-converse, telegram-webhook, briefing-compose. 1143 tests green across
       125 files, typecheck clean, Today + /glance checked at 384px and 1280px with zero overflow.

8. [x] Ask + Telegram conversational intelligence — one brain, both mouths. DONE.
       The real defect: Telegram ran its reads server-side and could hold a follow-up, while
       Ask emitted a tool intent to the browser, which pasted a canned paragraph the model
       itself had never seen. Same question, two answers, and "which one first?" had nothing
       to stand on. Ask's reads now run on the server BEFORE Echo writes a word.
       `_shared/echoReads.ts` (new, pure catalog + one executor over the existing
       `workReads` helpers, mirrored to the app as `src/lib/echoReads.ts`): whats_waiting,
       whats_due, whats_changed, project_status, where_do_i_stand — declared once, described
       once, so a surface can never reword a read. Telegram now spreads that same catalog
       instead of carrying its own copy of the five declarations.
       `vanta-converse` gained a read pre-pass (gemini-2.5-flash-lite, at most three reads,
       no read at all for chat or calendar questions the prompt already answers). Results go
       into the prompt as recorded fact with hard rules: one conclusion in Echo's own words,
       never a read pasted back verbatim, never a count the read does not contain, empty is
       a real answer. A failed read costs the answer nothing and is never claimed.
       Reads only by construction — nothing in the pre-pass can capture, stage, approve or
       execute, so the approval loop is untouched. Any read the server now owns is filtered
       out of the answering model's tool list, so the browser can never be asked to paste a
       second answer beside the streamed one.
       Provenance: the reads are streamed ahead of the text as plain English ("Read the whole
       board") and stored on the assistant message, so "Why this?" names real lookups.
       Verified live signed-in at 390px: "where do I stand?" now streams ONE grounded answer
       naming the actual pending calendar change and the two open promises, in Echo's voice,
       with no pasted block and no console errors. 1152 tests green across 126 files,
       typecheck clean. Deployed vanta-converse + telegram-webhook.
       Still queued from this pass: Ask visual / motion redesign, cross-source refinement,
       browser refinement, capability discovery / "Why this?" surfacing in the UI.

## Pinned (direction preserved, not being built now)
Insomniac-style ambient companion feel (situational flow, not a command centre). Body/wearable
context as observation only, never diagnosis. Unfamiliar-place help, local practical options,
non-emergency support with deliberate user-controlled escalation. Housing / everyday money /
travel context. All of it lands in Today / Work / Ask / Receipts — no Health, Travel, Finance
or Safety room.

## Ask visual + provenance pass
- [x] 9. Ask room redesign: Echo no longer speaks in a chat bubble. Answers read off a painted
      left edge with a small ECHO machine-label; the user's own words stay a right-hand bubble,
      so the two voices can never be confused. Streaming caret and reading line unchanged.
- [x] 9a. "Why this?" surfaced in the interface (`src/components/ask/WhyThis.tsx`). It renders
      ONLY `metadata.reads` — the plain-English lookups the server actually ran this turn. No
      reads, no button; the component has no other input, so it cannot invent a source.
      Older turns (and Telegram-era transcript rows) correctly show nothing.
- Verified signed in at 384px: no horizontal overflow, no console errors. 1,152 tests green.

## Capability discovery — done
- [x] 10. One catalog of reach: `supabase/functions/_shared/echoAbilities.ts` (pure) plus
      `_shared/echoAbilityFacts.ts` (recorded connection rows only) and the client mirror
      `src/lib/echoAbilities.ts`. Every row is live / needs connecting / not yet, with the reason
      and the law that limits it. Signing into a portal to book, pay or submit is stated as
      "not yet" rather than implied.
- [x] 10a. "What can Echo do?" panel in the Ask header (`src/components/ask/WhatEchoCanDo.tsx`,
      facts from `useEchoAbilities`). No power is shown without a record behind it.
- [x] 10b. Same answer in Ask and Telegram: `vanta-converse` injects the recorded ability block
      when the question is about reach; `telegram-webhook` answers from the same catalog, ahead
      of the older senses answer. Reach and senses stay two different questions.
- Verified signed in at 384px: panel opens, one honest summary line, scrollWidth 384, no new
  console errors. 1,159 tests green across 127 files; typecheck clean.


## Ask workspace + capture workspace pass — done
- [x] 11. Long-thread navigation (`src/components/ask/ThreadNav.tsx`). Four affordances and no
      outline tree: Start, Newest, Points, Find. "Points" is the person's own asks (the real
      pivots in a situation) — never an invented chapter heading. In-thread search matches every
      word in any order with n/m position and Enter / Shift-Enter stepping. A floating
      "Jump to latest" appears only when the newest turn is more than 240px off screen. The bar
      itself only appears once a thread is 8 turns long. 7 tests.
- [x] 12. Telegram → Ask thread routing (`_shared/threadRouting.ts` + client mirror). One inbound
      message decides continue / attach / fresh: a bound reply attaches, a scope mismatch always
      starts fresh, an open draft awaiting an answer owns the floor, an explicit "start fresh"
      is obeyed, a cold situation (>6h) reopens only when the wording reads as continuation and
      it is still inside 4× idle. The webhook records the decision and its reason on the user
      message, so the transcript says why a message landed where it did. Telegram keeps no
      separate logic fork and no separate UI. 10 tests.
- [x] 13. Capture layers (`_shared/captureLayers.ts` + client mirror). Four layers per capture:
      RAW (immutable), CLEAN, WHAT MATTERED, CONNECTIONS. `mergeLayers` cannot overwrite raw.
      Interpretation is stored beside the evidence in `notes.metadata.layers`, never on top of it.
      16 tests, including the raw-preservation invariant.
- [x] 14. Capture desk (`src/components/notes/CaptureWorkspace.tsx`, Memory → Capture). Three
      modes with the difference stated in the interface: Type (Echo stays out of the way),
      Dictate (Echo writes it down and says nothing back), Capture conversation (Echo stays quiet,
      then structures it AFTER you stop). Paper/tape/margin-rule look, machine stamps, waveform
      only while actually recording. Verdict is honest: "Saved. Nothing needs follow-up." when
      nothing was found.
- [x] 15. Extraction is not execution. A found follow-up becomes a `proposed` action through the
      normal `useStageAction` path and reads "waiting on your yes in Work". Nothing is created,
      sent or scheduled from a capture.
- [x] 16. Notes retrieval in the shared read catalog (`_shared/noteReads.ts`): `find_note` and
      `what_was_decided`. Both are read-only, scope-bound (personal reads exclude workspace rows
      and vice versa), and report only what a capture actually recorded — a note with no recorded
      interpretation returns "no recorded decisions", never a fresh guess. Ask and Telegram share
      the same two reads with the same provenance line. 7 tests.
- [x] 17. Deleting a disposable chat keeps the receipts: threads soft-delete, the deletion emits
      its own audit event, and no message / action / commitment / note / audit row is ever removed.
      3 source-invariant tests.
- Verified signed in at 384px: Capture desk renders, scrollWidth 384 (no sideways overflow), no new
  console errors. 1,202 tests green across 132 files; typecheck clean. Deployed telegram-webhook
  and vanta-converse.

## Polish + proof pass — closed out

- [x] 18. Telegram routing edge cases proved, not assumed (`src/test/thread-routing-edges.test.ts`,
      16 tests): a continuation stops stretching once it is 4× past cold; an open thread with no
      last-message time counts as cold; unknown open-thread scope is assumed to match; workspace
      stays inside the workspace; scope wins over both a named record thread and an unanswered
      draft; a reply attaches even when nothing is open on the channel; a replied-to notice beats
      the record's own thread; resets read through spacing and capitals but "news", "starting",
      "different from", "I forget" are not resets; empty and emoji-only messages never read as a
      reset; a bare "yes" to an open draft stays in the draft however stale; a fresh verdict never
      carries a thread id; the router is pure across repeated calls.
- [x] 19. On-device sweep. Ask and the Capture desk checked signed in at 384 × 1800 and
      1440 × 1200: scrollWidth equals clientWidth at both sizes (no sideways overflow), no broken
      glyphs, thread rail and thread-nav row (Start / Newest / Points / Find) both usable, no new
      console errors (only the pre-existing React ref warnings from the app shell providers).
      The Memory tab row clips on purpose — it is a snap-scrolling row, not a layout break.
- Full suite: 1,239 tests across 135 files, green. Typecheck clean.

## Ask shelf pass — closed out
- [x] 20. Unread-since marks. Device-local seen map (`vanta.ask.seen`), dot + bold title +
      "new since you looked" on a thread that moved after this device last read it; reading the
      thread clears it. A thread with no recorded activity never shouts. Count shown on the
      mobile bar and on the collapsed rail.
- [x] 21. Swipe-right threads. Left-edge pull (≤28px start, ≥56px right, mostly horizontal)
      opens the mobile thread sheet; the judgement lives in `threadShelf.edgeSwipeOpens`.
- [x] 22. Pinned initials. Collapsed desktop rail renders up to six pinned threads as two-letter
      tiles with their own unread dot, active thread ringed.
- [x] 23. Continue vs start fresh. Once a situation passes the same idle line the inbound router
      uses (6h), Ask offers "Start fresh" above the nav with "or keep writing to continue it."
- [x] 24. Day-grouped threads. Unpinned threads shelve as Today / Yesterday / Earlier this week /
      Earlier this month / Older; empty shelves never render. Pinned stays its own shelf, archived
      unchanged.
- New: `src/lib/threadShelf.ts`, `src/hooks/useEdgeSwipe.ts`, `src/test/thread-shelf.test.ts` (15).
- Full suite: 1,258 tests across 137 files, green. Typecheck clean. Verified live at 384 and 1440.

## Everyday-life pass — agenda workspace + street-smart layer
- [x] 25. Agenda board (Schedule → Board). Month strip with per-day marks, one selected-day board
      carrying only facts the entry actually held: when, how long, where (room from the address),
      who (explicit attendees, else an address written into the description — never a name guessed
      from a title). Feed rows stay read-only; only Echo's own entries carry a pencil.
      `calendar_events.attendees text[]` added (migration 0024) and read by `useAgenda` and
      `echo-calendar`.
- [x] 26. One entry per real entry. `src/lib/agendaBoard.ts` dedupes on the server's own key
      (uid, else lowercased title, plus start and end), so the board and Echo's answers agree
      about a day. A stay (≥20h) is not repeated as an appointment: it gets one line at the top
      with nights left and where.
- [x] 27. Street-smart layer. `_shared/streetSmart.ts` — one registry of everyday domains with an
      honest state each: money convert (live, published rate not a card rate), local help (live,
      says the number, never dials), roof / stay (live off own records, books nothing),
      body (live off recorded watch readings, never a health opinion), banking (needs a Plaid
      client id and secret), flight depth (needs a flight-data key), WhatsApp (needs a Business
      number with API access). Waiting rows say what they are waiting on and are never advertised
      as working. Shown in Ask's "What Echo can do" panel as its own section.
- [x] 28. Three new reads, same contract. `convert_money`, `local_help`, `body_read` registered in
      the shared `echoReads` catalog (names, "Why this?" source lines, tool shapes, executor arms),
      so Ask and Telegram read identically. Rates come from a keyless public table
      (`open.er-api.com`) and every answer carries the rate and the minute it was read; a failed
      read gives no number at all. An unknown country gets no number rather than a wrong one.
- [x] 29. Everyday-life question routing. `matchLifeQuestion` injects the registry into Ask's
      system block and answers Telegram directly, so neither surface can invent a capability.
- New: `_shared/streetSmart.ts`, `currency.ts`, `localHelp.ts`, `bodyRead.ts`, `lifeFacts.ts`,
  client mirrors, `src/lib/agendaBoard.ts`, `src/hooks/useLifeDomains.ts`,
  `src/components/schedule/AgendaBoard.tsx`, `src/test/agenda-board.test.ts` (17),
  `src/test/street-smart.test.ts` (21).
- Full suite: 1,302 tests across 140 files, green. Typecheck clean.
  Deployed: vanta-converse, telegram-webhook, echo-calendar.

## Pass 12 — the body desk
- [x] 30. Body log as a desk, not a room. `Schedule → Body`: weight, a cuff reading typed the way a
      cuff shows it ("128/82", pulse optional), temperature with its own unit, and medication
      courses with local clock times. `medications` table (migration 0025) follows the notes RLS
      pattern, so a workspace body log belongs to that room only. Readings land in
      `wearable_readings` as typed rows beside watch rows — one store, no second engine.
- [x] 31. Numbers reported, never read. `BODY_DISCLAIMER` stands on the page; every line says the
      number with its unit and nothing else. Movement is only ever the difference between two
      recorded readings. Blood pressure stores as its two parts and pairs back by the minute; a lone
      half says which half it is rather than being completed with a guess.
- [x] 32. A dose is a reminder, never an action. `DOSE_LAW`: Echo says a dose is due; marking it
      taken stays with the person. Doses show on the day inside the Board's selected day and in
      today's list on the desk. Paused, as-needed, and out-of-course days produce silence.
- [x] 33. One brain answers about it. `bodyRead` now carries today's medication and the next dose
      due, so Ask and Telegram say the same thing from the same read — read-only, scope-bound.
- New: `_shared/bodyLog.ts` + client mirror, `drizzle/migrations/0025_create_medications.sql`,
  `src/hooks/useBody.ts`, `src/components/schedule/BodyDesk.tsx`,
  `src/test/body-log.test.ts` (13). Changed: `bodyRead.ts`, `AgendaBoard.tsx`, `ScheduleSurface.tsx`.
- Full suite: 1,315 tests across 141 files, green. Typecheck clean.
  Deployed: vanta-converse, telegram-webhook.

## Still pinned (no credentials yet)
- Banking / Plaid — needs a Plaid client id and secret. Balances, transactions and a spend plan stay
  an honest seam; nothing is shown until a real link exists.
- Flight depth — needs a flight-data provider key. Departure and arrival times can be read and put
  on the board once there is a key; booking stays out — Echo records and prepares, it never buys.
- WhatsApp — needs a WhatsApp Business number with API access.

## Pass 13 — Money desk (banking, read-only)

- `bank_links` (migration 0026) holds one row per linked bank; `access_token`
  is withheld from `authenticated` by column grant and read only server-side.
- `plaid-bank` edge function: link_token / exchange / read / unlink. One bank
  refusing the read never erases the others — it is named as blocked.
- `_shared/bankPlan.ts` (+ client mirror): money per currency, never summed
  across them; pending entries stay out of arithmetic; a plan is arithmetic
  from what happened, never advice. `MONEY_LAW` says Echo never moves money.
- Schedule → Money: on-hand totals, the plan from the last 30 days, last
  entries, linked banks with unlink. Agenda board shows what a day cost.
- `money_read` in `_shared/echoReads.ts` so Ask and Telegram answer from the
  same read, with `bankRead` fetching link rows over REST with the service key.
- Tests: `src/test/bank-plan.test.ts` (9).
- Keys saved: PLAID_CLIENT_ID + PLAID_SECRET. Sandbox only for now — the
  function defaults PLAID_ENV to sandbox, so no env secret needed until
  development/production credentials exist.
- Migration 0027 lockdown: access_token/accounts columns revoked from every
  client role; workspace visibility limited to owner_admin/manager.

### Still pinned
- Flight depth — needs a flight-data key. Booking stays a purchase Echo
  prepares and records, never makes.
- WhatsApp — needs a WhatsApp Business number and signing secret.

## Pass 14 — Care directory and flight preparation

- `_shared/careFinder.ts` (+ client mirror): Overpass query, honest normalising
  (no name or no coordinates → dropped, never placed at the person), urgent
  care ranked first then nearest, straight-line distance said as straight-line,
  recorded hours repeated as recorded and never as "open now". `CARE_LAW`: Echo
  says where care is; it never dials, never books, never advises on treatment.
- `care-nearby` edge function shares the awareness Overpass cache, widens the
  radius until at least five places are found, and returns the radius it used.
- Schedule → Help: the published emergency number first, kind chips, search,
  keep/forget. Kept places live in `awareness_places` (category `care`) with an
  audit receipt, and surface on the Board.
- `_shared/flightPlan.ts` (+ client mirror) and migration 0028 `flight_plans`:
  Echo prepares from typed or pasted lines only. A line without a flight code
  and a time is handed back unread. A bare number is never read as a price —
  only a symbol or a currency code makes one. No cheapest is named across two
  currencies. `FLIGHT_LAW`: preparing is not buying.
- Schedule → Flights and the Board: prepared flights wait on the person's own
  tap; confirming writes departure (and landing, when recorded) as Echo-owned
  board entries and leaves a receipt. Nothing is bought, held or checked in.
- `care_nearby` + `flights_prepared` reads in `_shared/echoReads.ts`, answered
  from records only — a chat answer never triggers a fresh map lookup.
- Tests: `src/test/care-finder.test.ts` (15), `src/test/flight-plan.test.ts` (17).

### Still pinned
- Live flight status, gates and delays — needs a flight-data provider key.
- WhatsApp — needs a WhatsApp Business number and signing secret.

## Pass 15 — a flight Echo recognises, and where that flight actually is

- Migration 0029: `flight_plans` gains `origin_kind` (desk | recognised),
  `ownership` (unknown | mine | mine_too | theirs | not_mine), `traveller_name`,
  `booking_ref`, `noticed_from`, `live_status`, `live_checked_at`; new
  `flight_senders` table remembers the answer against the sender.
- `_shared/flightRecognize.ts` (+ client mirror): a deterministic pattern pass —
  flight code, named or ISO date, times, route, booking reference, ticket-style
  names. No model, no cost. A slash date is refused, because 03/10 is two days
  in two countries. A code with no date anywhere is handed back unread.
- `relationEvidence` states why a booking might concern you as recorded lines
  only: your name on it, your address on it, a sender you already answered for,
  a destination already on record, dates touching your own board. A destination
  or a date raises confidence; it never decides ownership.
- `_shared/flightNotice.ts`: recognition files one draft per leg with its
  evidence, an audit receipt (`flight.noticed`, `bought: false`), and — only when
  ownership cannot be read — one nudge that asks. Same flight, same day, one
  draft. Nothing reaches the board without the person's answer and confirmation.
- Wired in where Echo already reads: `email-inbound` runs the pass on the stored
  mail, `telegram-webhook` runs it before the router (a plain question about a
  flight never lands there, since a code and a date are required). Both reply
  with the question, never with a booking.
- Schedule → Flights: "Echo noticed a flight" with evidence and four answers
  (Mine / I'm on this too / Theirs, keep an eye on it / Not mine), asked once and
  remembered against the sender; "Read a booking" paste box; a watched shelf for
  someone else's flights, kept off the board.
- `flight-status` edge function on AviationStack (`AVIATIONSTACK_API_KEY`, with
  `FLIGHT_API_KEY` as fallback): a reading with the time of the reading on it,
  cached five minutes, receipted. Nothing on record is reported as nothing, never
  as "on time". `statusDiff` reports a change or stays silent.
- Echo signs into nothing, buys nothing, holds nothing, checks nobody in.
- Tests: `src/test/flight-recognition.test.ts` (17). Suite: 1,373 green.

## Pass 16 — a flight in two fields

- Schedule → Flights opens with **Add a flight**: a flight number and the day it
  leaves. Nothing else is asked. The route/times/price desk is folded behind
  "Got a route, times or a price? Add the detail".
- `_shared/flightQuick.ts` (+ client mirror): `readFlightNo` takes tg601, TG 601,
  tg-601, U2 2490, 3K 205 and drops the airline's leading zeros so TG0601 and
  TG601 are one flight. It refuses a bare number, a bare code and a sentence
  rather than guessing. A half-written date is refused; Echo never picks a day.
- After filing, one provider reading fills route, times and carrier — and only
  those. A flight AviationStack carries nothing for stays bare and says so:
  "that is what it said, not that the flight is wrong."
- Missing stays missing end to end: `FlightOption.depart_at` is now nullable,
  midnight is no longer a stand-in (recognition included), a timeless option
  reads "no times recorded yet", sorts last, cannot be confirmed, and writes no
  board entry until a time exists.
- One flight, one card. Number + day is the identity across all three ways in —
  typed, pasted, noticed. A repeat lands on the card that already exists,
  dropped plans excluded, and the ownership question is never asked twice.
- Receipt: `flight.added_by_number`, `bought: false`.
- Tests: `src/test/flight-quick.test.ts` (22). Suite: 1,395 green.

### Still pinned
- WhatsApp — needs a WhatsApp Business number and signing secret.
- Plaid stays on sandbox credentials until development keys exist.

## Pass 17 — the journey, and the sit in the middle of it

- **A journey is the object, not a flight.** `_shared/journey.ts` chains legs that
  meet at the same airport within a day into one trip (IAD → NRT → BKK), renders
  as one card that moves down the shelf, and still writes departure and landing
  onto the Board. No new room.
- **Position is derived and labelled.** `legOf` prefers the airline's actual time
  over estimated over scheduled and says which it used. `legState` reads
  cancelled, diverted, filed landing, filed takeoff, then the clock — and a filed
  landing time that simply passed reports as "in the air, the airline has filed
  nothing since", never as landed.
- **Your word beats the feed.** `OVERRIDE_CHOICES` on every leg: I did not make
  this flight / still at the airport / I am on it / I am on the ground. An
  override is stamped on the leg with "you" as the source, leaves an audit
  receipt, and is reversible. A leg you say did not happen stops everything after
  it — nothing later is assumed.
- **The layover is the feature.** `layoverBetween` shows the subtraction: gap on
  the clock, minus boarding (40m), minus a terminal change (30m), minus
  immigration (45m), and what is actually yours. Terminals that were not filed
  stay unknown rather than assumed equal. Leaving the airport is only offered
  above four usable hours, with the math on show.
- **What's around you.** `airport-places` (auth-only, one category per call, eight
  results, shared week-long cache in `airport_places_cache`) reads water, food,
  coffee, pharmacy, SIM, somewhere to lie down, shower and cash through the
  Google Maps gateway. Hours only where published; "open now" only when the
  provider said so, with the reading time on it. Empty is an answer.
- **Ground notes are kept by hand.** `_shared/countryNotes.ts` — Thailand, Japan,
  US, Singapore, UAE, Qatar, South Korea, UK: transport, money, and the
  shakedowns, every line dated. A country with nothing written returns nothing
  rather than plausible travel advice.
- **No bars is the normal case.** The whole journey is written to the phone with a
  saved-at stamp; a refresh reports the diff (`packDiff`) and no news is a valid
  answer. Two big numbers on top for 3am: time left here, next gate.
- **It speaks up.** `journey-watch` refreshes only legs within eight hours of a
  filed time (20-minute reading freshness), then files one `journey_moved` nudge
  carrying the arrival message or the diff, always closing on the terminal
  caveat. Scheduled every 15 minutes (`journey-watch-quarter-hour`), and it
  cannot eat the flight quota: a leg costs a reading only from 3h before its
  filed departure to 2h after its filed arrival, landed/cancelled is never asked
  again, a bare number-and-day flight is read only on its own day, and a hard
  ceiling of 40 provider readings a day (`FLIGHT_DAILY_BUDGET`, logged in
  `api_usage_logs`) stops the sweep dead. Over budget, the journey still reads
  from its last stamped reading — it never guesses to fill the gap.
- Ask and Telegram answer the journey first via `flightRead`: where you are, whose
  word says so, time left, next gate, the layover math.
- 27 new checks in `src/test/journey.test.ts`. 1,422 tests green, typecheck clean,
  Flights QA'd at 384px.

## Pass 18 — the flight number has one obvious door, and Telegram uses it

- **A real address.** `/flights` (and `/flight`) land straight on the flight desk
  via `?surface=schedule&tab=flights`; every Schedule desk is now linkable by
  `?tab=`. Today carries a standing "Add a flight — number and a day" row so the
  thing you type standing in a boarding line is one tap, not three.
- **Same rules from a chat box.** `_shared/flightChat.ts` (pure) reads a typed
  line deterministically: `readDay` takes a written date, today/tonight,
  tomorrow/tmrw, "sep 20"/"20 september", 9/20, or the next weekday, rolls a
  month already gone into next year, and names no day when none was named.
  `readFlightAsk` files a number with a day, asks one question when the day is
  missing, drops on cancel/drop/scratch, and ignores a bare code buried in a long
  sentence that never says flight. No model decides any of this.
- **One filing path.** `_shared/flightFile.ts` — `fileFlightByNumber` dedupes by
  number+day inside scope (a second attempt hands back the existing card), writes
  a prepared card with a receipt, then takes one counted reading and leaves the
  card exactly as bare as the provider left it. `dropFlightByNumber` drops from
  either side and says plainly that nothing was booked, so nothing was cancelled
  with an airline. `_shared/flightProvider.ts` holds the single provider read plus
  the shared 40-a-day ceiling (`countedRead`), so a Telegram-filed flight cannot
  outspend the sweep — over budget it says so instead of guessing.
- **Telegram, hybrid as asked.** A deterministic block ahead of the model: file,
  ask-the-day (remembered on `profiles.preferences.flight_day_question` for 30
  minutes so a bare "friday" completes it), or drop. Filing is capture; confirming
  a flight onto the Board still only happens inside the platform. Every reply ends
  on the terminal caveat.
- 13 new checks in `src/test/flight-chat.test.ts`. 1,435 tests green, typecheck
  clean, `/flights` QA'd at 384px. `telegram-webhook` deployed.

## Pass 19 — Phase A: a foreign number means something

Approved plan: `.lovable/plan/metro-echo-everyday-life-expansion-plan-only-2026-09-16.md`.
Phase A only. No new room, no tools menu — two abilities under the same Echo.

- **`_shared/measures.ts` (pure).** Exact factors for length, mass, volume, area,
  temperature and speed with everyday aliases; `parseMeasureAsk` reads
  "42 m2 to sqft", "how many miles is 10 km", "180 lb in kg" and bare "32c";
  an explicit target that names a different family returns nothing rather than
  quietly converting something nobody asked for; unknown units return nothing.
  `senseOf` adds a meaning sentence only where an anchor is written down
  (area: studio / city apartment / comfortable / family; temperature: cold
  through dangerous heat; walking distance 100 m–25 km) and stays silent
  everywhere else. `shoeAnswer` covers US/UK/EU/cm within the kept table and
  refuses outside it.
- **`_shared/countryFacts.ts` (pure).** 16 countries, each line stamped with the
  day it was checked: plugs, voltage, driving side, date format, clock, tax in
  or on the price, tipping, how people pay, fuel units, SIM/eSIM, a few phrases.
  `factsAnswer` returns only the topics actually asked about plus the emergency
  number from `localHelp`. A country with nothing written gets no guess.
- **One brain, both surfaces.** `convert_measure` and `how_things_work` are
  registered in `_shared/echoReads.ts`, so Ask and Telegram gained them at the
  same time from one definition, with provenance lines for "Why this?".
  `echoAbilities` advertises both as live with their limits stated.
- **Proof.** `src/test/measures.test.ts` (21) and `src/test/country-facts.test.ts`
  (9). Full suite 1,465 green; typecheck clean.
- **Next.** Phase B (street-smart trouble lane + friction reasoning + local
  cultural context) waits on approval.

## Pass 20 — Phase B: the street-smart lane, friction, local sense

Approved and built. Still no new room and no tools menu — three more abilities
under the same Echo, on both surfaces at once.

- **`/flights` is its own page.** It was a redirect into the schedule desk;
  now `src/pages/Flights.tsx` renders the flight desk on a plain address with
  a link across to the deep desk. `/flight` redirects to it.
- **`_shared/trouble.ts` (pure).** 19 kept playbooks, each stamped 2026-09-16:
  lost wallet, lost passport, card declined, ATM kept the card, dead phone,
  missed train/bus/connection, hotel, taxi, locked out, missing package, power
  or internet out, flat tyre or scooter, broken appliance, doctor vs clinic vs
  pharmacy, prescription abroad, printing/notary/mail, government office,
  delayed or damaged bag, "is this fee normal". Every playbook carries one
  first move, an ordered set of steps, what Echo still needs from the person,
  and the hard edge on what Echo will not do. Matching takes the situation the
  person led with (earliest phrase, longer phrase on a tie). A situation with
  no kept playbook gets no invented steps.
- **`_shared/friction.ts` (pure).** Money, minutes, transfers and walking
  counted together; `hassleScore` charges eight minutes a transfer and half a
  minute a walking minute. Cheapest, fastest and least hassle are named
  separately; a field missing from any option is not ranked on and is said out
  loud; a single option is never called the best one; the practical move comes
  back labelled a judgement, never a fact.
- **`_shared/customs.ts` (pure).** 13 countries, each stamped: bargaining,
  dress, religious spaces, queues, manners and formality, timekeeping, tourist
  pricing patterns, service, how people expect to be contacted. Only the topics
  asked about come back. A country with nothing written gets silence, not a
  stereotype. Money norms stay in `countryFacts`.
- **One brain, both surfaces.** `what_to_do`, `compare_options` and
  `local_customs` are registered in `_shared/echoReads.ts` with provenance
  lines; `echoAbilities` advertises all three as live with their limits.
  `vanta-converse` and `telegram-webhook` redeployed.
- **Proof.** `src/test/trouble.test.ts` (9), `src/test/friction.test.ts` (11),
  `src/test/customs.test.ts` (8). Full suite green; typecheck clean.
- **Next.** Phase C (travel polish — only what is missing) waits on approval.

## Pass 21 — Phase C: travel polish, and Echo speaking up first

- **A flight change now interrupts you, in the right measure.**
  `_shared/journeyNotice.ts` turns a journey diff into one heads-up with real
  urgency behind it: a cancelled or diverted leg is critical, a gate or terminal
  move or a delay of 30 min or more is high, a state change is ordinary, a
  ten-minute slip is a footnote. An empty diff returns nothing at all — silence
  stays a valid outcome. The nudge carries the matching priority and a title
  that names the actual change ("Your gate moved"), not a generic one.
- **Today says it without being asked.** `journey_moved` joined `DRIFT_KINDS`,
  so a flight change lands in the same quiet Today lane as a drifting promise,
  and `NudgesPanel` labels it "Flight".
- **Telegram gets the same note, never a second brain.** `journey-watch` reaches
  the linked chat only when the awareness opt-in is on AND a chat is linked, and
  quiet hours hold everything except a leg that is off or diverted. Every send
  writes a receipt (`journey.reached_messaging`); the run report counts pings.
- **`_shared/travelSense.ts` (pure).** When to leave: a 120-min cushion
  domestic, 180 crossing a border, 150 when Echo cannot tell — every cushion
  named as an assumption. No filed departure means no leave time, and a ride
  time Echo was not given is asked for, not invented. What the clock does:
  offsets read from the kept airport table, "Bangkok runs 11 hours ahead of
  Washington", a body-clock note only past a three-hour jump, silence for an
  airport that is not kept.
- **On the desk.** Prepared and confirmed flight cards now carry the leave-by
  line, the clock shift and the body-clock note under the live reading.
- **Proof.** `src/test/journey-notice.test.ts` (9) and
  `src/test/travel-sense.test.ts` (9). Full suite 1,511 green; typecheck clean.
  `journey-watch` redeployed.
- **Still not built, on purpose.** Airline login, check-in, seat selection,
  buying, holding. Trip documents pulled from mail and files stay open.
- **Next.** Phase E (housing and what living somewhere really costs) — Phase D
  money remains blocked on real bank credentials.

## Pass 22 — Phase E: housing and what living somewhere really costs

- **`_shared/housing.ts` (pure).** Recurring money (rent, utilities, internet,
  commute, fuel, parking, building fees, laundry, maintenance, local tax) added
  only from figures the person gave; move-in cash (deposit, agency fee, move-in
  fee, furnishing) kept separate and never folded into a monthly number. Money
  you do not get back is spread over the term to give a true monthly; a returnable
  deposit is excluded from that. Unwritten lines are named as missing, not free.
  No term means no spreading. A comparison refuses to cross currencies, refuses
  to call one place a comparison, and refuses to weigh a place with nothing
  written down. Landlord behaviour comes from the person's own notes only.
- **`LEASE_CHECKS` / `leaseWords()`.** Ten questions a contract has to answer —
  term and break clauses, penalties, deposit deductions, inclusions, repairs,
  rent rises, restrictions, address registration, notice, condition report.
  Questions only; the contract in hand gives the answers.
- **One Echo.** `cost_of_living` and `lease_checks` added to `_shared/echoReads.ts`
  (names, sources, tool definitions, executors), so Ask and Telegram gained both
  from one definition. A `housing` ability row states the reach and the limit.
- **Proof.** `src/test/housing.test.ts` (14). Full suite 1,525 green; typecheck
  clean. Client mirror `src/lib/housing.ts`.
- **Not built.** No housing dashboard, no market-rent lookup, no invented
  landlord reputation, no legal advice.
- **Next.** Phase F (body context, fenced) — Phase D money still blocked on real
  bank credentials, Phase G on a WhatsApp Business number.

## Pass 23 — Phase F: body context, fenced

- **`_shared/bodySense.ts` (pure).** Recent recorded days held against this
  person's own earlier days. Totals add up (steps, active and training minutes,
  caffeine, water, calories, sleep); levels average (heart rate, HRV, weight,
  blood oxygen, stress). Under ten per cent difference reads as about the same.
  Fewer than three earlier recorded days means there is no usual yet and Echo
  says so instead of comparing against nothing. A usual of zero is never divided
  by. A non-number is skipped, never counted as zero.
- **How it speaks.** "The last 3 days against your own usual: you slept less
  (355 against a usual 480) and trained harder." Steady things fold into one
  tail line. Every answer states that usual means the person's own recorded days
  and carries the no-diagnosis line. No verdicts, no explanations, no advice.
- **One Echo.** `body_compare` added to `_shared/echoReads.ts` (name, source,
  tool, executor) with `bodyCompare` in `bodyRead.ts` doing the scoped read, so
  Ask and Telegram both gained it. A `body_sense` ability row states the fence.
- **Proof.** `src/test/body-sense.test.ts` (14). Full suite 1,538 green;
  typecheck clean. Client mirror `src/lib/bodySense.ts`.
- **Not built.** No scores, no invented biomarkers, no diagnosis, no coaching,
  no body dashboard.
- **Next.** Phase H (ambient depth). Phase D money still blocked on real bank
  credentials, Phase G on a WhatsApp Business number and API access.
