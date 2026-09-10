# Telegram as the same Echo, not a remote control

Telegram already shares Echo's brain for notes, promises, projects and staged
calendar proposals. What it does not share is the *calendar read* — and its own
system prompt still tells it that it cannot approve anything. So it answers
calendar questions blind and sends you to the app for a decision it can already
make. This plan closes that gap without a new room, a second action engine or a
second notification model.

## What the audit found

**A. Already exists and gets reused as-is**
- Ingested calendar truth: `calendar_events` filled by `supabase/functions/calendar-sync` (iCal, read-only, rolling window), read today by `src/hooks/useAgenda.ts`, `useSituation.ts`, `useAskSuggestions.ts`.
- One proposal shape and one resolver: `supabase/functions/_shared/calendarProposal.ts`, `_shared/calendarResolve.ts` (`resolveEventReference` already returns one / many / none), mirrored client-side by `src/lib/calendarProposal.ts`.
- Telegram can already stage a calendar proposal against real events: `telegram-webhook/index.ts:253-349` (`stage_calendar_change` — queries `calendar_events`, resolves, detects conflicts, writes an `actions` row, audits).
- Telegram can already approve exactly one proposal: callbacks `calyes` / `calno` at `telegram-webhook/index.ts:803-878` — ownership check, version check, `status = 'staged'` guard, conditional update, `action_events` + `audit_log`, buttons retired, honest outcome line from `approvalOutcomeLine`.
- The action spine and its executor: `actions-transition`, `actions-execute` (`runGoogleCalendar`, `actions-execute/index.ts:66-112`, create-event through the connector gateway), rollback in `_shared/actionRollback.ts`.
- The read-only tool pattern to copy: `_shared/workReads.ts` (`whats_waiting` / `whats_due` / `whats_changed`) — short formatted answers, never invented counts.

**B. Only wiring and wording (the actual bug in the screenshot)**
1. No calendar read tool on Telegram. The tool list (`telegram-webhook/index.ts:158-170`) has no `whats_on_calendar`, so the model has nothing to call and deflects.
2. The channel law contradicts the code: `TELEGRAM_CHANNEL` (`index.ts:~128-140`) still says "You cannot approve… say it's waiting inside Metro Echo", while `calyes` exists. The prompt is why it redirects.
3. Backend-ish copy: `ROUTE_LABEL.action = "an action draft"` and the Sherlock triage line `index.ts:703` ("Looks like an action draft. Open Metro Echo to approve").
4. "Open Metro Echo" is appended to every calendar proposal (`index.ts:349`) and is the default keyboard for everything else.
5. Refinement re-runs the tool and stages a *second* action row; the old row stays `staged` with live buttons.
6. Contradiction handling exists only as source text on the proposal — no compare-before-propose step.

**C. Genuinely new (small)**
- `_shared/calendarRead.ts`: one shared read helper — now / today / tomorrow / a named day / conflicts / what follows an event — with Telegram-length formatters. Used by Telegram *and* `vanta-converse` so capability stays identical.
- `refine_calendar_change`: refine the pending proposal in place (bump `version`, rewrite `payload`, retire the old Telegram buttons) instead of staging a new row.
- Cross-surface settle: store the Telegram `chat_id` + `message_id` on the action payload when buttons are sent, and clear those buttons when the action leaves `staged` on any surface.
- Execute-once guard on approval → execution (an idempotency key on the action payload, checked in `actions-execute`).

**D. Blocked on Google write authorization**
Update / cancel / attendee / RSVP executors, provider event ids + etags on `calendar_events`, provider-confirmed receipts, and noticing Google-side edits. Until then approval *holds* and says so — which is already the honest wording.

**E. Not building**
A Calendar room, a Telegram-only calendar store, a second notification or ack engine, standing "always yes" permission, silent writes, or an iCal write path.

## Phases

**Phase 1 — Telegram can read the calendar (no write risk)**
- Add `_shared/calendarRead.ts` and a `whats_on_calendar` tool (args: `when` phrase, optional `event_reference`) answering: what's on now, a day's list, conflicts, what follows a named event. Caps at five lines, "(+N more)" like `formatDue`.
- Register the same read in `vanta-converse` so Ask and Telegram answer identically.
- Rewrite `TELEGRAM_CHANNEL`: Telegram may read the calendar and may approve one fully-shown staged change; it still may not export, send, book or pay.

**Phase 2 — Resolve, propose, refine, decide in Telegram**
- Ambiguity is a question, not a guess: `many` → "Which one? 1) … 2) …"; `none` → say so plainly.
- Add `refine_calendar_change` (version bump + old buttons retired). "Actually 3:30" updates the pending proposal only.
- Keyboard rules: Yes / No for ordinary changes; high risk (cancel with attendees, unknown attendee count on a shared event) gets an explicit typed-word style confirm button labelled with the consequence. `Open Metro Echo` appears only for ambiguity beyond four candidates, more than two conflicts, multiple pending proposals, or a receipt.
- Human copy pass: "Here's what I'd change" / "Nothing has changed yet" / "Yes / No".

**Phase 3 — Contradiction before change**
When a forwarded message carries a time, address or cancellation, compare against the resolved event first and lead with the mismatch: "Clinic says 11:30; your calendar says 11:00. Update it? Yes / No." The source line is already carried on the proposal.

**Phase 4 — Cross-surface settle**
Persist the Telegram message reference on the action; when the action leaves `staged` anywhere, retire those buttons and post one short outcome. Reuses `logTgMessage` / `telegram-send`; no new ack table.

**Phase 5 — When Google write lands**
Same conversation, real execution: approval calls the existing executor with an idempotency key, then the reply carries provider confirmation or the provider's own failure text. No UX redesign.

## Example transcripts

*Read:* "What's on my calendar right now?" → "Wingate stay, through Fri. Next: ADHD appointment, 11:00. Nothing else today."

*Move:* "Move my doctor appointment tomorrow to 3" → "Doctor appointment, tomorrow. Time: 11:00 → 3:00 PM. Overlaps Standup, 3:15. Nothing has changed yet. Yes / No"

*Refine:* "Actually 3:30" → "Updated. Time: 11:00 → 3:30 PM. Clear of Standup now. Yes / No" (old buttons go dead)

*Ambiguous:* "Move my doctor thing" → "Two match: 1) Doctor appointment, tomorrow 11:00 2) Doctor follow-up, Thu. Which one?"

*Contradiction:* forwarded clinic message → "Clinic says 11:30; your calendar says 11:00. Update it? Yes / No"

*High risk:* "Cancel the partner review" → "Cancel Partner review, Thu 14:00. 4 people get a cancellation from Google. Confirm cancel / Keep it"

## Risks called out
- **Race:** refine vs. an in-flight Yes — the existing version + `status='staged'` conditional update already resolves it; keep both on every new path.
- **Double execution:** once writes exist, approval and execution must be separated by an idempotency key, or a retried callback books twice.
- **Under-reported consequence:** iCal gives no reliable attendee list, so an unknown attendee count on a shared event must escalate risk, never default to low.
- **Service-role blast radius:** the webhook uses the admin client; every new calendar query must filter `user_id` (and scope) explicitly, like the current ones do.
- **Floating timezones:** `_shared/ics.ts` treats named/floating zones as UTC, so read answers can be off by hours for some feeds; the read helper should render in the user's stored timezone and this stays a known limit until OAuth.

## Where this touches the simplification work
Reuses Ask's live suggestions, the Work/Schedule desk as the deep read, the single action spine and Receipts' provenance. Nothing new appears in navigation.
