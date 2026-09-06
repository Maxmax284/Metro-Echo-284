# Audit findings and the next pass

Four read-only passes covered the Aware room, Telegram, local reality, and room/presence coherence. Below is what is actually true today, then the work I propose.

## What's genuinely solid

- One place-truth module (precision, staleness, who set it) drives both Aware and "What Echo can see".
- Scanning is deliberate. The only automatic AI calls are one rescan when a location fix resolves and one reverse-geocode for an unnamed place.
- Trips are one shared row: started in Telegram, read in the app, closed either side.
- Telegram shares the real machinery with Ask — same router, same working context, same file classifier, same voice. Naming is clean: users only ever read "Echo" / "Metro Echo".
- Proactive messages are properly gated (opt-in, linked chat, urgency, quiet hours) before anything is sent.
- Situation reading and signal bundling are real synthesis, not lists.

## Confirmed problems

1. **Fourteen rooms in the tab bar, not four.** Today, Work, Ask, Receipts, plus Projects, Inbox, Briefs, Memory, Commitments, Schedule, Actions, Sherlock, Aware, Cockpit — all as siblings.
2. **Workspace chats vanish from Ask.** Telegram writes a conversation's scope as `workspace`; Ask only recognises `organization`. So every workspace-routed Telegram thread is invisible in the thread list. Verified in code.
3. **Eight senders bypass the single Telegram path.** Action execution, drift sweep, Sherlock digest, commitment reminders, inbound reach and four utility functions post directly, so those messages leave no thread record and no receipt.
4. **Most Telegram replies carry no "why".** Only field/trip replies do; captures, reminders and work answers say nothing about where the answer came from.
5. **Two trip cards in the same room.** Aware shows both the field card and the older trip panel over one table.
6. **Two wearable pages** share three panels verbatim; two of the side pages (`/watch`, `/glance`) have no link pointing at them at all.
7. **Three places show Telegram state**, and three settings pages sit outside the settings registry.
8. **"Around you" isn't grounded in what's around you.** The nearby-places lookup is only used to recover a bad location fix; the shelf is fed by search results.
9. **Nothing answers "what changed around here" or "what's tonight".** Weather is current conditions only; calendar events aren't folded into an evening read; place snapshots are never diffed.
10. **Suppression is invisible.** The pipeline records exactly why something was withheld (cooldown, budget, quiet hours, low confidence); no screen ever shows it.
11. **The shell only reacts to state in Today.** The calm/pressure treatment is applied there and nowhere else.
12. **`operational_state_events` is written to nothing and read by nothing.**

## Proposed pass, in order

**A. Fix the two real bugs (small, high value)**
- Write `organization` as the conversation scope from Telegram, and backfill existing rows so workspace chats reappear in Ask.
- Route the eight bypassing senders through the single send path so every message lands on the thread with a receipt.

**B. Collapse the rooms back to four**
- Tab bar shows Today / Work / Ask / Receipts only. The other ten stay reachable as desks inside Work, which is where they already belong in the nav model.
- Delete the duplicate trip panel from Aware, keep the field card.
- Merge the two wearable pages into one; remove the two unlinked pages.
- Put the three stray settings pages behind the settings registry, and make Telegram state show in one place.

**C. Make Echo answer local reality**
- Ground "Around you" in the saved-place and nearby-place data instead of search results.
- Add an evening read: today's remaining events plus a real forecast window, in one sentence, on demand.
- Diff place snapshots so "Changed" can say what changed rather than that a scan ran.

**D. Show the quiet decisions**
- A "held back" line in Receipts listing what Echo decided not to interrupt with, and why, from recorded suppression reasons only.
- Carry the shared "why this" shape into ordinary Telegram replies.

**E. Presence**
- Apply the state-reactive shell treatment in all four rooms, not just Today, and either wire `operational_state_events` to it or drop the table.

## Technical notes

- Scope fix: `supabase/functions/telegram-webhook/index.ts:318` plus a one-time `update conversations set scope='organization' where scope='workspace'`.
- Send consolidation: `actions-execute`, `awareness-drift-sweep`, `sherlock-digest`, `commitment-reminders`, `_shared/reminderMessage.ts`, `_shared/awareness/inboundReach.ts`, `telegram-send`, `telegram-test` → `sendTelegram` in `_shared/telegramApi.ts`.
- Tabs: `src/components/shell/SurfaceTabs.tsx:30-46`; parenting already exists in `src/lib/navigation.ts`.
- Suppression surfacing reads `suppression_reason` from the evaluator's shadow records; no new inference.
- Nearby grounding reuses `awareness-nearby-places` and `awareness_overpass_cache`; no new provider.

Order matters: A is a bug fix and should ship first, B is removal, C and D are new capability, E is polish.
