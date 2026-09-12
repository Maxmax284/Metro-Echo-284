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
