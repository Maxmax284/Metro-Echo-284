# Vanta Production Polish Pass — Audit + Plan

## Audit findings (what's actually in the code right now)

**Mobile / PWA / Nav**
- `SurfaceTabs` bottom nav primary tabs are: Command, Capture, Commit, Actions. Overflow ("More" sheet): Memory, Sherlock, Awareness, Audit.
- **Today / Schedule is not in the nav at all.** `ScheduleSurface.tsx` exists, has Today / Upcoming / This Week tabs, mounts `DailyBriefingCard` + `ScheduleQueryChips`, but `rg ScheduleSurface src/` finds zero render sites. It's dead-wired. This is the biggest single blocker — Today is the doctrine's primary surface and the user can't reach it.
- Companion bubble sits at `bottom-20 right-4` on mobile. Nav is `bottom-0` with `safe-bottom`. The bubble clears the nav vertically but sits over the right edge of card content; on 384px Today/Schedule it lands near "Approvals" quick-jump.
- `InstallVantaSection` already hides in standalone (recent pass). PWA install copy reasonable.

**Push delivery (Stage 2)**
- `PushReadinessSection` handles permission flow correctly: tap-only request, audits `push.permission_requested / granted / denied`, copy is honest ("Delivery is staged"). Status states cover unsupported / blocked / off / on.
- Missing: explicit "staged" copy in status badge, quiet-hours / urgent-only / delivery-channel preferences UI (mentioned in spec). No service worker. No `push.subscription_*` events yet — appropriate since delivery is staged.

**Telegram delivery (Stage 5)**
- `commitment-reminders` edge function: opt-in via `prefs.telegram_reminders_enabled`, quiet hours respected (urgent override), `metadata.telegram_sent_at` dedupe with 6h throttle, `last_reminded_at` second throttle, audits `reminder.telegram_sent / skipped_quiet_hours / failed`. Solid. Copy is human ("Heads up: …", "⏰ Overdue: …").
- Missing: visible delivery status strip on Settings ("last sent / failed / skipped"). No completed/snoozed/archived guard — the query already filters `status = open`, so that's covered. ✔

**Schedule / Briefing**
- `ScheduleSurface` Today renders: Briefing → Query chips → Summary strip → Due today → Files needing review → QuickJump (captures/approvals). Answers 5 of the 6 doctrine questions; missing **Overdue** as its own section (overdue folds into "Due today" via `t <= endToday`).
- `schedule.viewed` audit is debounced 1.5s ✔.
- `DailyBriefingCard` (assumed correct from prior pass): "Polish with Vanta" button + `briefing.generated / ai_polished` events.

**Companion / Intent handler**
- `useIntentHandler.ts` handles `query_schedule`, `query_waiting`, `query_files_needing_review`, `query_aftermath` (from prior pass). DB-first, TZ-correct.
- Missing: dedicated handlers for "what happened to that Telegram message" (aftermath by source = telegram), "what did I promise <name>" (named-entity filter). Lower priority — `query_aftermath` and `query_waiting` already cover the spirit.

**Sherlock**
- `SherlockSurface` exists (375 lines, not deeply audited this pass). Spec says light polish only. Defer.

**Audit log**
- Push permission events ✔. Telegram delivery events ✔. `schedule.viewed` ✔. `briefing.generated / ai_polished` ✔. Push delivery events intentionally absent (staged).

---

## The plan — 7 stages, no scope creep

### Stage 1 — Wire Schedule into the nav + mobile shell fixes (highest-impact)
1. Add `"schedule"` to `SurfaceKey` union in `SurfaceTabs.tsx`. New `PRIMARY` order on mobile: **Command, Schedule, Capture, Commit** + More (Actions, Memory, Sherlock, Awareness, Audit). Desktop rail keeps all items, adds Schedule between Command and Capture. Label: "Today", icon: `CalendarClock`.
2. Mount `<ScheduleSurface onNavigate={setSurface} />` in `Index.tsx` for `surface === "schedule"`.
3. Move companion bubble on mobile from `right-4` to `right-3 bottom-24` (clear bottom nav + give 8px more breathing room from card edges). Add `pointer-events-auto` on bubble, ensure parent `z-40` stays under sheets/drawers (`z-50`).
4. Quick 384px sweep of Today/Schedule, Files, Memory, Settings — fix any horizontal overflow or sub-32px touch targets found. No layout rewrites.

### Stage 2 — Push readiness polish (no live delivery yet)
1. Add an explicit "Staged" badge + status line in `PushReadinessSection` for the `on` state ("Permission granted · Delivery: Staged").
2. Add a small "Delivery preferences" subsection in `TimeRemindersSection`: read-only display of current channel routing (In-app + Telegram, Push staged), plus quiet-hours summary pulled from `profiles.preferences`. No new toggles — just surfaces what's already there in human copy.
3. Keep all permission requests tap-only. No service worker registration.

### Stage 3 — Schedule Today polish
1. Add an **Overdue** section above "Due today" in `ScheduleSurface` (filter `dueDate < startToday` from `commits`). Empty state hidden if none.
2. Add a "Waiting on you" sub-row inside QuickJump for `pendingActions` already wired.
3. Confirm Today answers the six questions: due (✔ today list), needs review (✔ files + captures via QuickJump), promised (✔ commitments), reminders (✔ today list reminders), files waiting (✔), approvals (✔), can wait (✔ upcoming tab). After Overdue is added — all six.

### Stage 4 — Daily Briefing sanity pass
- Verify `DailyBriefingCard` mounts on Today only (it does), uses counts-first deterministic line, AI polish stays behind explicit tap. No code change unless audit shows regression — keep it cheap.

### Stage 5 — Telegram delivery status surface
1. In `TimeRemindersSection`, add a compact status strip below the Telegram toggle: "Last sent · Skipped (quiet hours) · Failed" counts from the last 7 days of `audit_log` where `event LIKE 'reminder.telegram_%'`. Single query, cached on mount.
2. Vanta-voice copy: "Last reminder sent 2h ago." / "Quiet hours blocked 1 today." / "No reminders sent yet."

### Stage 6 — Companion mobile sanity
1. Verify drawer height `80dvh` / `95dvh` doesn't clip on 384px iOS Safari keyboard (already uses `dvh`).
2. Bubble z-index audit (Stage 1 covers).
3. No new intents this pass — current `query_*` set is sufficient. Defer named-entity ("what did I promise Nikki") to later.

### Stage 7 — Light Sherlock polish (only if safe)
1. One pass through `SherlockSurface` mobile density: convert any horizontally-scrolling chip rows to wrapped flex on `< 420px`. No new features, no new AI calls.
2. Defer object handoff (send file/note/commitment to Sherlock), evidence graph, re-run scope — all staged for next pass.

---

## Out of scope (explicitly deferred)
- Google Calendar sync
- Live web-push delivery / service worker
- Deep Sherlock object investigation
- Named-entity companion queries
- New notification channels

## Acceptance
- Schedule reachable in two taps from any surface on mobile
- Today answers the six doctrine questions including Overdue
- Companion bubble doesn't overlap primary actions on 384px
- Push status reads "Staged" honestly; no fake delivery
- Telegram status strip shows real audit data
- No new auto-AI calls anywhere
- No new tables, no migrations
- All copy passes Vanta voice (no "permission state persisted" leaks)

## Estimated maturity after pass
Overall ~85 · Mobile/PWA ~80 · Push ~78 (staged honest) · Schedule/Briefing ~86 · Companion ~84 · Telegram ~86 · Sherlock ~64 (intentional).
