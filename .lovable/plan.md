## Vanta Final Wiring + Trust Cleanup — Execution Plan

This is a wiring/trust pass, not a feature build. No new mansions. The plan mirrors the 8 stages in your brief, sequenced as safe waves so we can stop, verify, and validate at each checkpoint.

---

### Wave 0 — Audit (no code changes)

Produce a short findings doc covering all 14 audit areas. For each: what works, what's miswired, what's UI confusion, what's backend failure, what's config failure, what should be staged-labeled, what to fix now vs defer.

Key files to read end-to-end:
- Awareness: `AwarenessSurface`, `AttentionQueue`, `BadLocationRecoveryPanel`, `LayerChips`, `SignalCard`, `SourceStatusPill`, `MiniRadarStrip`, `AwarenessProvider`, `awarenessLocation.ts`, `awarenessPlainTalk.ts`, `locationSanity.ts`, `awareness-*` edge functions.
- Push/VAPID: `PushReadinessSection`, `pushClient.ts`, `push-config`, `push-test`, `_shared/webpush.ts`, service worker `public/sw.js`, VAPID secrets check.
- Telegram reminders: `TelegramLinkCard`, `TimeRemindersSection`, `commitment-reminders`, `telegram-webhook`, `telegram-link`, `telegram-test`, reminder cron + dedupe.
- Conversation: `vanta-converse`, `telegram-webhook` prompt, `useIntentHandler`, `ReminderComposer`, `companionTools.ts`, `vantaVoice.ts`, `_shared/vantaVoice.ts`.
- Mobile: surfaces above @ 384px.

Deliverable: in-chat findings summary + a small downloadable PDF audit so we have a receipt before we start touching wires.

---

### Wave 1 — Awareness truth + recovery consolidation (Stage 1)

- Single source-of-truth for active place (`useActivePlace`): GPS / saved / manual / last-confirmed / fallback / none. Computes the one-line banner.
- Collapse Fix-Location chip + recovery card + unresolved-saved + confirm-place into one `LocationRecoveryPanel` shown only when truly bad.
- Rewrite plain-talk strings in `awarenessPlainTalk.ts`: kill "critical / hazard / hampered / specificity unavailable". Replace with human copy from the brief.
- Source chips reflect *actual* per-provider state (live / cached / failed / off).
- Reddit/community provider: isolate failure so it can't poison the whole layer; degrade with "Community source unavailable right now." Audit the SerpApi engine/params/quota path.
- Acceptance: one active-place line, one recovery panel, no duplicate warnings, layered fallback copy, clean degradation.

---

### Wave 2 — Push/VAPID diagnostics (Stage 2)

- Split `PushReadinessSection` into 5 status rows: device permission · subscription · server delivery (VAPID) · reminder channel · last push.
- Add `push-diagnose` edge function: validates VAPID pair format, checks secret presence, attempts dry sign, returns structured reasons (no secret leakage).
- Client never claims "Push ON" unless all four prerequisites are green; otherwise "Push permission is on, but delivery still needs setup."
- Detect stale subscription (key mismatch) → prompt re-enable on device.
- Emit the audit events listed in Stage 2 (push.*, reminder.push_*).
- Acceptance: no contradictory ON/Setup-Needed; reasons are human; private key never reaches the client.

---

### Wave 3 — Telegram delivery trace (Stage 3)

- Diagnostic block under Time & Reminders: Telegram on/off, link state, last cron check, last sent, last skipped (with reason), last failure (human).
- `commitment-reminders` cron: emit structured audit per reminder (`reminder.tg_scheduled/sent/failed/skipped_*`) with reason codes; only set `metadata.telegram_sent_at` after API success.
- "Send test Telegram reminder" button → calls `telegram-test` with explicit user tap, logs `reminder.telegram_test_sent/failed`.
- Verify dedupe and quiet-hours logic don't false-skip; fix if so.
- Acceptance: every missed/sent reminder can be explained from the UI without reading logs.

---

### Wave 4 — Conversational routing + voice (Stages 4 & 5)

- Sweep `vanta-converse`, `telegram-webhook`, fallback strings, `vantaVoice.ts` for "I can't directly…" / "As an AI…" — replace with routing for supported intents.
- Extend `useIntentHandler` + `reminderParse.ts` to cover the full intent list (in/at/tomorrow/tonight/weekend/before-after/AM-PM ambiguity → ask).
- Add response pools (reminder created / needs time / note saved / commitment detected / fallback). Telegram = short; Companion = slightly more explanatory.
- Emoji rules baked into voice helpers (allow on confirmations, forbid on failures/security).
- Acceptance: supported asks route, ambiguous asks clarify, no generic refusals on supported lanes.

---

### Wave 5 — State sync + mobile polish (Stages 6 & 7)

- Realtime/refetch on: reminders insert/update, push state changes, place changes, source status, audit events for Telegram/push.
- Awareness, Settings, Today, ReminderComposer, Companion all retested at 384px: kill stacked warnings, hidden controls, keyboard overlap, Companion bubble blocking.
- Acceptance: no stale "broad/offshore" after place selection; Schedule shows chat-created reminders without reload; primary actions visible on mobile.

---

### Wave 6 — Final validation report (Stage 8)

- What was fixed · what's staged · push live/blocked · VAPID valid? · Telegram test result · Awareness clean? · Conversation routes? · mobile notes · honest score delta (target 86–88 overall).
- Delivered as a short downloadable PDF receipt.

---

### Guardrails (applied to every wave)

- No paid AI/API calls on render.
- No notifications without opt-in + due reminder.
- Plan → Approve → Execute preserved; capture never executes.
- No duplicate Memory/Notes/Files/Telegram/Sherlock/Actions/Audit/Reminder systems.
- Out of scope: Google Calendar, ecosystem bridges, deep Sherlock, WhatsApp, new providers, autonomous actions.

---

### How I'd like to run it

Default cadence: **Wave 0 (audit) on its own**, then **2 waves per turn** if checks stay green. If you want a faster lane, say "audit + Wave 1 in one shot." If you want me to skip the audit PDF and just post findings inline, say so.
