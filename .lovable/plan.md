# Calendar exchange, one approval, three surfaces

Goal: Echo can talk about your calendar, propose changes to it in plain language, and — once Google write access exists — actually make those changes, with one approval that counts everywhere and a receipt that proves the write. No Calendar room. No fifth room. No second action engine.

## What the audit found

**Calendar today is a read-only sense, and honestly built as one.** `calendar-sync` fetches an `.ics` address, keeps a 31-day window, works out what actually changed, and stops. It never posts anything back. Three real constraints:

- Event identity is `feed_id + uid + starts_at`, and every sync **deletes and re-inserts the window**, so a stored event's row id is not stable between syncs. A staged proposal must point at `uid + starts_at`, never a row id.
- There is no provider, external id, or version column anywhere on feeds/events/changes. An iCal `uid` is not usable as a Google event id for writes.
- Named timezones in the feed are ignored (floating times read as UTC). Fine for reading a day, not good enough to write a time back.

**The action spine is already the thing this needs.** `proposed → staged → approved → executed → audited / rolled_back`, one transition function that refuses illegal jumps, a typed confirmation phrase for high risk, per-step events plus audit rows, and real undo (not a relabel). Every surface stages through one shared row builder.

**A Google Calendar executor already exists** and is wired end to end: it creates an event through the connector gateway and its undo deletes it. Two gaps: it can only **create** (no move, retitle, enrich, cancel, RSVP, reminders), and no Google Calendar connection exists in the workspace yet, so it cannot run.

**Ask and the "chat widget" are the same code.** The widget is a dock that renders the Ask conversation, sharing thread routing, live turn state, intent handling and approval cards. Anything built once appears in both. Ask already shows live suggested prompts built from real records, and already knows your next event — calendar-aware prompts are almost free.

**Telegram is deliberately forbidden from approving anything** ("you cannot approve, execute, export, send, book, or pay"). But the button plumbing it would need already exists and is already user-verified: inline buttons, callback handling, ownership checks, button-clearing after use, audit on every tap.

**Receipts can already prove an external write** — the executor stores the provider result and the audit row records success or the provider's own failure wording. What's missing for calendar specifically: before/after values on the record, and which source justified the change.

### Sorted the way you asked

**A — exists, reuse as is:** action lifecycle, transition guards, high-risk gate, undo, action events, audit trail, staged-action cards and execute confirmation, the Google Calendar create executor, calendar read + change detection, `calendar_changes` with a "already told you" marker, Ask live suggestions, Telegram inline-button approval plumbing, nudge dedupe keys and quiet hours.

**B — only wiring and polish:** a calendar-shaped proposal (currently a staged action carries only title/description/risk — no structured change); Ask suggestions that mention the calendar when there is something real to say; Telegram allowed to approve *one specific staged change* and nothing else; showing a pending approval wherever you are; clearing a Telegram prompt once you approved it elsewhere; a receipt line that reads "was 2pm, now 3pm, because of the message from the clinic".

**C — genuinely new:** the Google Calendar **connection** itself (a link you open once); write operations beyond create (move, retitle, location/description, reminders, cancel, attendees/RSVP where Google allows); a resolver that turns "my doctor appointment tomorrow" into one specific event and asks when it is unsure; contradiction detection between a message and the calendar; a stable link between a Google event and Echo's own context; execute-once protection so a double tap cannot double-write.

**D — wait for Google authorization:** anything that changes Google. Cancellations with attendees. RSVP and conference links. Noticing edits made directly in Google (needs the provider's own change feed; the iCal window is too blunt and too slow).

**E — do not build:** a Calendar room, a month-grid dashboard, calendar forms as the main way to create things, a separate calendar engine for Telegram, auto-applying changes without approval, standing rules that let Echo write unattended, a second notification system, and write attempts on iCal credentials — iCal cannot write, and pretending otherwise is how trust dies.

## Phases

### Phase 1 — useful while nothing can be written (no Google needed)

1. **A calendar proposal that is a real object.** One staged action shape carrying: which event (`uid + start`, or "new"), the exact fields changing, before and after, why, and where the "why" came from. Bundled edits ("move training to 6 and remind me 30 before") are one proposal, one approval, one receipt.
2. **Resolve, don't guess.** "My doctor appointment tomorrow" resolves against the read-only calendar. One match: show it. Several: ask which. None: say so.
3. **Conflicts and consequences read out before approval:** what it collides with, whether travel time still works, what was true because of the old time and no longer is.
4. **Honest ceiling.** Every proposal ends with: *"Nothing has changed yet — Google write access isn't connected."* Approving stores your decision and holds it as ready to apply; it never claims a write.
5. **Refinement before approval.** "Actually make it 3:30" edits the proposal. The calendar is untouched either way.
6. **Contradiction surfacing.** A forwarded message that disagrees with the calendar gets shown as a disagreement first, with both sides and both sources, never silently resolved.
7. **Enrichment that needs nobody's permission.** An address or note found in a message can attach to Echo's own context for that event immediately, clearly marked as Echo's note rather than Google's fact.
8. **Made obvious without advertising.** Calendar-aware Ask prompts only when grounded ("What do I need before my next event?", "Anything conflicting tomorrow?"); a quiet "ask Echo to move this" affordance on an agenda row; the widget offering the change when you are looking at the event. No banners, no feature tour.
9. **Telegram gets the same proposal** with a compact Yes / No, and the same "not connected yet" line.

### Phase 2 — write access (after you connect Google)

10. Connect Google Calendar once; the app says plainly whether writes are live.
11. Extend the executor from create-only to move, retitle, location, description, reminders and cancel — each one undoable where Google allows it.
12. Cancelling with attendees, or anything touching other people, gets the stronger confirmation, and says how many people get told.
13. Approving anywhere executes once. A duplicate tap is a no-op, not a second event.
14. Receipts show before, after, who approved, from which surface, the source that justified it, and Google's own confirmation.
15. Google-side edits made elsewhere come back as a change with downstream reasoning: what moved, and what is still true.

Held-back approvals from Phase 1 are not re-designed — they simply become applyable.

## One interruption, many surfaces

The staged action row *is* the shared state, so approval is already single-truth. What gets added is behaviour around it: a pending approval is visible in Today, Ask, the widget and Telegram; approving on one clears the others (the Telegram prompt's buttons get removed, exactly as reminders already do); nothing new is invented for notification — existing dedupe keys, quiet hours and the priority ladder decide whether Telegram is even used.

## Companion behaviour worth having (small, doctrine-safe)

Preparedness before the next event; travel time as a consequence of a move, not a widget; loose ends a move leaves behind; "still true / no longer true" after a change; a short read of a gap in the day; source-tagged enrichment; a temporary context pack for the day of a big event that expires on its own.

## Example conversations

**Ask — move.** *"Move my doctor appointment tomorrow to 3."* → "Doctor, tomorrow 14:00–14:45. Moving to 15:00 puts it 20 minutes from the 16:00 call, and the drive is 15. Change the time to 15:00? Nothing has changed yet." → *"Actually 3:30."* → proposal updates. → Yes → held (Phase 1) or written with a receipt (Phase 2).

**Widget — create.** *"Book a haircut Friday 5."* → "New event, Friday 17:00, one hour. Free that slot. Create it?"

**Widget — enrich.** *"Add this address to the event."* → "Adding *42 Sathorn Rd* to Dentist, Thursday 11:00, from the clinic's Telegram message. This lands as Echo's note; Google's own entry stays untouched."

**Telegram — refine then approve.** "Training moves to 18:00 and a nudge 30 minutes before. One change. Yes / No" → *"make it 18:30"* → "18:30, nudge at 18:00. Yes / No" → **Yes** → "Held. Google write access isn't connected." (Phase 2: "Done. Google confirmed. Receipt saved.")

**Telegram — cancel with attendees.** "Cancelling *Vendor review*, Friday 10:00. Three people get a cancellation from Google. Reply CANCEL to confirm."

**Any surface — contradiction.** "Two versions of Thursday. The clinic's message says 11:30; your calendar says 11:00. I haven't picked one. Which is right?"

## Where this touches the simplification work

Calendar proposals land in Work's *what's landing* / *what I owe* shelves rather than a new desk; calendar changes bundle into Today's existing situational read, never a separate lane; the calendar prompts extend the live Ask suggestions already built; the calendar receipt is written as a human sentence in the same Receipts read; and the pending-approval sync is the first real user of one-interruption-many-surfaces instead of a parallel mechanism.

## Technical notes

Proposal payload keyed on `feed_id + uid + starts_at` (row ids are not stable across syncs). A Google event id and calendar id get stored on the action once a write happens, and a durable Echo-side link between a Google event and its context is added in Phase 2. Timezone handling must be explicit for writes — the current floating-time-as-UTC read is not accurate enough to write back. Executor stays the only write path; `actions-execute` gets an execute-once guard. The Telegram approval route approves exactly the referenced staged action, re-checks ownership, respects the risk gate, and cannot execute anything else.
