
# Vanta Final Polish — Audit + Plan

## Part 1 — Audit findings (done before any code)

**Conversational routing**
- `vanta-converse` tools: `capture_note`, `stage_action`, `add_commitment`, `run_sherlock`, `query_awareness`, `query_schedule`. There is **no `set_reminder` tool**. So when a user says "Remind me in 20 minutes," the model can only call `add_commitment` (or, often, just answers in prose). That is the root cause of "I can't directly set reminders."
- `telegram-webhook` tools are a strict subset (no schedule/awareness/reminder). Same root cause, worse.
- System prompts do **not** literally say "I can't set reminders" — but they also never assert the capability, and they don't pass the user's timezone/default times. The model fills the gap with generic LLM hedging.
- `useIntentHandler` already creates commitments with `remind_at` (auto -24h when `due_at` present). It can accept a pure reminder if we route it through `add_commitment` with `remind_at = due_at`. No new table needed.
- Telegram intent handler `applyIntent` mirrors useIntentHandler but writes `source: "telegram"`. Good.

**Voice**
- `src/lib/vantaVoice.ts` + `_shared/vantaVoice.ts` have a `vantaSay` library but each phrase returns a single fixed string. No variation. Comment says "no emoji, no exclamation marks." Hard rule — user now wants occasional, tasteful emoji + variation pools.
- No phrases for: `reminderCreated(time)`, `reminderNeedsTime`, `reminderAmPmAsk`, `commitmentDetected`, `pushNeedsSetup`, `pushReady`, `noteSavedVar`, fallback "pick the lane."
- One generic-sounding refusal site exists in `awarenessPlainTalk.ts` ("I can't tell what payment options…") — that is the awareness honesty layer, NOT a chat refusal. Leave alone.
- No "I can't directly / as an AI / unable to" strings anywhere in our code. The generic refusals come from the LLM itself when no matching tool exists. Fixing routing fixes most of it.

**Push delivery**
- No service worker file (`public/sw.js` missing). No VAPID keys configured. No `push_subscriptions` table. No web-push library import.
- `PushReadinessSection` already correctly says "Delivery: Staged" and only requests permission on tap. Honest.
- `commitment-reminders` cron handles Telegram + audit only. Push branch absent.
- Conclusion: push delivery cannot go live this pass without (a) VAPID keys added as secrets, (b) a service worker, (c) a subscriptions table, (d) `web-push` in an edge function. We will wire the **full path** but keep it gated on VAPID secrets being present, so behavior remains honest if keys are missing.

---

## Part 2 — Plan

### A. New `set_reminder` intent (Companion + Telegram)

1. Add tool `set_reminder` to both `vanta-converse` and `telegram-webhook` tool lists. Args: `summary` (string, required), `when` (string, free-form time hint like "in 20 minutes" / "tonight" / "5pm Friday" / ISO), `timezone` (optional override).
2. New util `src/lib/reminderParse.ts` + edge mirror in `supabase/functions/_shared/reminderParse.ts`. Logic:
   - Parse "in N minutes/hours/days" → absolute UTC now+N.
   - Parse "tonight/morning/afternoon/evening/weekend" → use user defaults (passed in via system prompt).
   - Parse "5pm / 17:00 / 5" with `parseTimeHint` (existing in `src/lib/timeRules.ts`; lift core regex into shared file).
   - Returns `{ status: "ok", due_at, remind_at, timezone } | { status: "needs_time" } | { status: "needs_ampm", hh, mm } | { status: "needs_tz" }`.
3. Pass `timezone` + `default_morning/afternoon/evening_time` into both system prompts (load from `profiles` once per request, as Telegram already does for corrections/field_notes).
4. Update **system prompt** explicitly: "You CAN create reminders, notes, commitments, actions, and answer schedule/awareness queries via your tools. Never tell the user you are unable to do these — route them. If a reminder time is missing or ambiguous, ask one short clarifying question instead of refusing."
5. Handler:
   - **Companion** (`useIntentHandler`): add `kind === "set_reminder"`. On `ok`, insert a commitment row with `summary`, `due_at`, `remind_at`, `metadata: { kind: "reminder", source: "companion" }`. Audit `reminder.scheduled`. On `needs_time`/`needs_ampm`/`needs_tz`, do NOT insert — just toast a hint; the chat reply (model-generated) already asked.
   - **Telegram** (`applyIntent` in telegram-webhook): same, `source: "telegram"`. Reply uses new `VANTA_PHRASES.reminderCreated(when)` / `reminderNeedsTime()`.
6. Audit events added: `reminder.scheduled`, `reminder.needs_time`, `reminder.needs_ampm`, `reminder.created` (alias of scheduled for compat).

### B. Voice warmth + response variation

1. Refactor `vantaSay` and `VANTA_PHRASES` so the most-used keys return a **rotated phrase** from a pool. Add a tiny `pick(...arr)` helper (Math.random — fine, no determinism required for toasts).
2. New / expanded keys:
   - `reminderCreated(when)` — 4 variants, one with ⏰
   - `reminderNeedsTime()` — 4 variants
   - `reminderAmPmAsk(time)` — "5 AM or 5 PM?"
   - `noteSaved(title?)` — 4 variants, one with 📝
   - `commitmentDetected()` — 3 variants
   - `pickTheLane()` — fallback "Note, reminder, commitment, or Sherlock?"
   - `pushReady()`, `pushNeedsSetup()`, `pushOff()`, `pushBlocked()`
3. Telegram channel modifier in `telegram-webhook` already says "brief, no emoji" — relax to "brief, occasional emoji ok if it earns its place; never in failure or warning messages." Keep markdown off (Telegram default rendering).
4. Update both system prompts with explicit voice rules: vary phrasing, warm-but-grounded, no "Great news!", no "Absolutely, I'd be happy to assist!", no "As an AI…". Emojis only on success acknowledgements and never on errors/warnings.

### C. Push delivery — finalize the path, honestly gated

1. Add three secrets via `add_secret` (only after user confirms): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:). Until present, push stays "Setup needed."
2. New migration: `push_subscriptions` table — `id, user_id, endpoint (unique), p256dh, auth, user_agent, created_at, last_used_at, last_error, disabled_at`. RLS: user can CRUD own.
3. `public/sw.js` — minimal service worker: `push` event renders title/body/url; `notificationclick` focuses or opens `/`. No background fetch, no cache logic.
4. New `src/lib/pushClient.ts`:
   - `registerPushServiceWorker()` — registers `/sw.js`, idempotent.
   - `subscribeUserToPush(vapidPublicKey)` — calls `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, inserts to `push_subscriptions`.
   - `unsubscribeUser()` — calls `pushSubscription.unsubscribe()`, deletes row.
   - Reads `VAPID_PUBLIC_KEY` from a new edge function `push-config` (returns `{ vapidPublicKey, configured: boolean }`) so the client never hardcodes it.
5. New edge function `push-config` (GET) — returns `{ configured, vapidPublicKey }`. If VAPID env vars missing → `{ configured: false }`.
6. Extend `PushReadinessSection`:
   - On mount, call `push-config`. If `configured=false`, show "Push delivery needs setup" pill, hide the Enable button copy and replace with disabled state + plain hint.
   - If configured + permission `default`, the Enable button now (a) requests permission, (b) registers SW, (c) subscribes, (d) audits `push.subscription_created` / `push.subscription_failed`.
   - If permission `granted` + subscription exists → status "Push is ready."
   - Provide a "Disable push on this device" button → unsubscribe + audit `push.subscription_removed`.
7. Extend `commitment-reminders` cron:
   - After the Telegram branch, add a **push branch** (only runs if `prefs.push_reminders_enabled === true`, VAPID env present, and a `push_subscriptions` row exists for the user).
   - Respect quiet hours (same helper). Urgent override = `priority === "urgent"`.
   - Dedupe via `metadata.push_sent_at` (same throttle as Telegram).
   - Use `npm:web-push@3` (Deno) to send; on 404/410 disable the subscription (`disabled_at`).
   - Audit: `reminder.push_scheduled`, `reminder.push_sent`, `reminder.push_failed`, `reminder.push_skipped_quiet_hours`.
8. Notification copy: title `"Vanta Reminder"`, body = `composeTelegram(...)` reused (sans emoji prefix), URL `/?surface=schedule`.

### D. Settings copy + status strip

1. `TimeRemindersSection` push row: replace "soon" badge with dynamic badge tied to `push-config` + permission + subscription:
   - `Setup needed` (VAPID missing)
   - `Off` (no permission)
   - `Ready` (subscription exists)
   - `Blocked` (permission denied)
2. Below the Push switch, mirror the Telegram delivery strip: last push sent, failed count, skipped count (from `audit_log` events `reminder.push_*`).

### E. Acceptance / verification

- Companion: "Remind me in 20 minutes to check the booking file." → `set_reminder` tool fires, commitment row created with `remind_at = due_at = now+20m`, audit `reminder.scheduled`, toast "Done — I'll remind you in 20 minutes. ⏰".
- Companion: "Remind me at 5." → model asks "5 AM or 5 PM?" (no row created).
- Companion: "Remind me tonight." → model uses default evening time (e.g. 19:00), confirms.
- Telegram: same three scenarios produce short replies with no markdown, no refusal.
- Push: with VAPID unset → Settings says "Setup needed", no permission prompt available. With VAPID set → Enable flow creates a `push_subscriptions` row and audit shows `push.subscription_created`. Cron next tick can send a push for a due reminder; audit shows `reminder.push_sent`.
- No `vanta-converse` or `telegram-webhook` reply contains "I can't", "I'm unable", or "As an AI" for supported actions.
- 384px: Settings push row + status strip don't overflow; Enable button is full-width tap target.

### Technical notes

- No new tables besides `push_subscriptions`. No changes to RLS on existing tables.
- `web-push` in Deno: `import webpush from "npm:web-push@3.6.7"` works; if the import fails in the runtime we fall back to a hand-rolled VAPID JWT + raw `fetch` to the endpoint (kept as second commit if needed).
- All new edge functions auto-deploy. `push-config` is read-only and may have `verify_jwt = false` for cheap polling from the client; subscription writes go via the supabase-js client with the user's JWT (RLS-protected) — no service-role needed.
- Cron continues to run as today; the push branch is additive and skipped cleanly when prerequisites aren't met.

### Out of scope (per instructions)

Google Calendar, deep Sherlock object investigation, native mobile, new reminder/notification systems beyond the existing commitment-as-reminder pattern, automatic AI calls on render, executing external actions without approval.
