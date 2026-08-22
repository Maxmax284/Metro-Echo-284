# Camp State rename + instant, detailed Telegram notices

Three problems, one pass: the old name is wrong, notices arrive way too late, and when they do arrive they say almost nothing.

## 1. Ground Truth → LMT Camp State (naming only)

Every user-facing label becomes **LMT Camp State** (short form "Camp State"). The internal source key stays `ground_truth_hub` so live webhooks, stored secrets, and existing history keep working — new aliases `camp_state`, `lmt_camp_state`, `campstate` are accepted too, so the other platform can switch its payload key whenever it wants.

Labels updated: ecosystem sources panel, reconciliation view, operations briefing, plain-English mapper (currently says "GroundStay"), briefing composer, integration registry, and the `GTH …` prefixes in capture summaries.

## 2. Notices arrive in seconds, not up to an hour

Today an inbound Camp State event only writes an inbox capture. Nothing reaches out until the hourly awareness sweep runs (and quiet hours can push that further), which is why it feels dead slow.

Change: right after a signal is captured, the inbound handler evaluates it for immediate reach — booking created/changed, payment failed, and guest requests/messages qualify. It reuses the existing consent gates (proactive awareness on, Telegram pref on, a linked chat) and the same quiet-hours rules, with critical signals allowed to break quiet hours. Delivery still lands the item in Today first; the message is notification-only, no buttons, nothing executes from chat.

## 3. Notices actually say what happened

Right now a booking event becomes one thin line ("GTH booking created: guest"). Replace the one-liner with a structured detail builder per event family:

- **Bookings**: guest, room/unit, check-in → check-out with nights, party size, status change (from → to), amount + currency, booking reference, channel.
- **Payments**: amount, currency, method, status, failure reason, related booking reference.
- **Guest messages / requests**: room, urgency, and the actual message text (trimmed to a readable excerpt, not dropped).

The detail lines get stored on the capture so the inbox row, the Today notice, and the Telegram message all read from the same structured facts. Missing fields are simply omitted — no invented values.

## 4. Telegram test send you can actually find

A **Send test message** button in Settings under Proactive awareness, right beside the Telegram toggle. It reports back plainly: sent, or the reason it couldn't (no linked chat, connector not configured, provider error text). The test message is formatted exactly like a real Camp State notice so you can judge the wording, not just the plumbing.

## Technical notes

- `supabase/functions/_shared/externalPlatform.ts`: `displayName` → "LMT Camp State", add aliases, replace `summarize()` with a `buildSignalDetail()` returning `{ title, lines[] }`; persist `lines` in message metadata (`detail_lines`) and in the audit payload.
- New `supabase/functions/_shared/awareness/inboundReach.ts`: composes an inbound notice, writes the nudge (dedupe on `owner+idempotency_key`), then calls the existing `deliver.ts` gate logic; urgency mapped `payment.failed`/`guest_request.created` → time_sensitive, `booking.state_changed` cancellations → critical.
- Called from `handleExternalPlatformWebhook` after the capture + route write, wrapped so a delivery failure never fails the webhook (still returns 200 with `reached: false`).
- `telegram-test`: accept optional `{ sample: "camp_state" }` to render a realistic notice; return `{ sent, failed, reason, errors }` unchanged otherwise.
- `src/components/settings/TimeRemindersSection.tsx`: test button + inline result; existing delivery audit list stays.
- Tests: extend `src/test/awareness-pipeline.test.ts` for inbound urgency mapping and gate short-circuits, plus new cases for detail-line building (full payload, sparse payload, alias resolution).
- No schema migration needed; no new tabs or surfaces.
