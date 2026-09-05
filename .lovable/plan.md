# Metro Echo / Echo — field companion audit (no code touched)

Everything below was read out of the current codebase. Where I couldn't confirm something, I say so.

## 1. Naming: how much is actually left

The rename already happened. There are **zero** user-facing "Vanta" / "Vanta X" strings left in shipped copy — the sweep is done and `brand.ts` (one small file that owns the two names) is the single owner. What's still sitting there is internal plumbing plus a short list of real leftovers.

Safe to clean now (user can see or would notice these):
- `WhatVantaSees.tsx`, `InstallVantaSection.tsx`, `HowVantaWorksSection.tsx` — filenames only, copy already reads Echo. Rename is cosmetic and low risk.
- Fake email address `…@inbound.vanta` shown in the Inbox card and first-run card. That's shown to a human as an address to forward mail to — either make it real or stop printing it.
- Geocoder outbound `User-Agent: VantaMindfulAI/1.0` and the `vantav2.lovable.app` URL baked into it — outside services see this.
- Push notification tag `"vanta"` in `public/sw.js`.
- Model-facing prompt strings `ask_vanta` used as a route name in the awareness brief prompt and snapshot routes. Not visible, but it teaches the model the old name.

Leave alone on purpose (renaming buys nothing and can break live traffic):
- `vanta_*` database columns, `X-Vanta-*` signed webhook headers (outside platforms sign against these), the `vanta-converse` function name, `vanta-*` CSS classes, `vantaVoice` / `vantaIdentity` / `vantaSay` module names, and `localStorage` keys like `vanta.skin` (renaming those silently wipes user settings).

**Rule to write down:** blind search/replace is the enemy here. Public copy = Metro Echo / Echo. Storage keys, headers, columns, function names, CSS = frozen legacy.

## 2. Telegram: how far from "Echo in your pocket"

Honest answer: it's a good bot with a real memory. It is **not** the same brain as the app yet. `telegram-webhook/index.ts` is a 1,066-line monolith that runs its own show.

What is genuinely shared today:
- Thread continuity: Telegram creates and reuses one row in the same `conversations` table Ask uses, per linked chat. Real win from the last pass.
- Voice and depth: brand voice, response-depth directive, `fitToBody` compression, sensitive-content detection.
- Action staging: it stages through `buildActionRow`, so nothing executes from chat. That law holds.
- Reading files: OCR/text extraction goes through the shared `pageRead`/`lookAt`.
- Capability status ("what can you see") reuses the shared reader.

What is still a second brain:
- **No capability router.** Telegram has its own intent dispatcher (`applyIntentCore`) and its own model tool-loop, parallel to the one `vanta-converse` uses. Two places to teach every new command.
- **No working context.** The app assembles a working-context block; Telegram's system prompt is static text. So Telegram doesn't know what project you're in.
- **No "Why this?"** Provenance never gets attached to a Telegram reply.
- **Message history is siloed.** The thread row is shared but the transcript lives in `telegram_messages`, not the shared `messages` history the in-app thread reads. So "start on Telegram, continue in the app" shows you a different conversation.
- **File ingestion bypasses the schema module.** Telegram writes `ingested_files` with raw literals — no detected type, no confidence, no review status. App uploads go through `fileIntake.ts`. Same table, two grades of row.
- **Three separate Telegram senders**: the webhook's own `tg()`, the `telegram-send` function, and a third POST inside `awareness-drift-sweep`.
- Deep links exist but are shallow: an "Open" button per room, plus `?commitment=<id>`. No thread or session carried across.

Verdict: about 45% of the way. Thread + voice + staging are shared; brain, context, provenance, transcript and files are not.

## 3. Walk With Me — what already exists (building nothing)

The trip spine is better than expected and is the right foundation.

- `trips` + `trip_points` tables, RLS per user, FKs to `awareness_places` (saved places).
- Deliberate start/end only. Nothing auto-starts. `closed_by` records `you | auto_stale | auto_gap`, and a trip left open >12h closes "at the last point it had" and says so.
- Sampling only while a trip runs and the tab is visible, every 60s. That's foreground-only, by design.
- `placeTruth.ts` is a real single precision policy: street/neighbourhood/city/area buckets from accuracy metres, 12h staleness, manual vs device vs saved source. This is the thing that stopped Today and Aware from arguing.
- Snap-to-saved-place within 300m.

What's missing before one shared session model:
- **No session id.** Nothing in the code represents "an active thing you're in." The closest is a scope key + last-seen resume pointer. A trip is the only stateful span that exists — so a trip *is* the session, and that's fine, but the app needs to treat "open trip" as first-class state that Today, Aware, Telegram and the watch all read.
- **Trips are client-only.** No edge function reads or writes them. Telegram cannot see or open a trip at all today.
- **Approval never travels** (deliberately). So a Walk With Me started on Telegram can be observed everywhere, but any approval has to happen where you are.

Conclusion: the trip spine **can** become the shared session, once it's readable server-side and Telegram can start/end/append to it.

## 4. Natural-language activation ("Echo, walk with me")

Today, no. Those phrases would land in the webhook's ad-hoc dispatcher and get glued in as regex, which means Ask wouldn't understand them. `capabilityRouter.ts` is the right owner — it's pure decision logic, already understands "may prepare an action, never execute," and both surfaces could call it. Prerequisite: item 2's router unification. Do that first, add the phrases once, both surfaces learn them together.

## 5. SOS / safety handoff — the only safe shape today

What the stack can honestly support later: **prepare, hand off, never execute.**

Already there: staging that cannot be born approved; a consequence preview that always ends "Nothing has changed yet."; an explicit state machine (`proposed→staged→approved→executed→audited`) where high-risk requires typing a confirmation; rollback that only marks undone if the undo really worked; a receipt in `audit_log` for everything.

Not there, and don't pretend otherwise:
- No `location_shares` table — no recipient, no expiry, no revoke.
- No trusted-contact concept at all.
- **Delivery only reaches you, never a third party.** The whole awareness pipeline is self-notification.
- `LocationSetup` currently promises the user in plain words that Echo "never shares where you are." Any share feature has to renegotiate that promise honestly, in the UI, before a line of code.

Safe first role for SOS, whenever we get there: recognise the language, show options, prepare a share action, deep-link into Metro Echo with it loaded and unapproved, and offer the device's own emergency dialer. Nothing autonomous.

## 6. Field-mode sources: trust grades

| Source | Exists? | Where it plugs in | Trust today |
|---|---|---|---|
| Device location | Yes, foreground one-shot + 60s sampling | `placeTruth` → Situation/Aware | Good, with precision honesty |
| Saved places | Yes (`awareness_places`) | 300m snap | Good |
| Trip history | Yes (`trips`/`trip_points`) | client only | Good but invisible to server/Telegram |
| Calendar | Yes (read-only .ics + sync) | signals into Awareness | Decent; destination context is thin |
| Telegram messages/files | Yes | arrivals lane | Works, low-grade metadata |
| Source health | Yes (client `sourceHealth.ts`) | Aware / What Echo can see | Fine in app, absent on Telegram |
| Battery/device state | Only device *class* sniffing, local-only | — | Not a real signal yet |
| Wearable | Tables + sweep exist | glance layers | Thin data, don't lean on it |
| Nearby lookups | Yes (`awareness-nearby-places`, plus a second geocoder) | Aware | Two implementations — that's roadmap item 4 |

## 7. Postures — one place already, plus one stray

`Posture` already exists with nine values (`at_desk, deep_work, meeting, training, driving, travel, moving, quiet, sleep`), a source (`manual/suggested/inferred/unknown`), persistence on the profile, an expiry, a noise-hold list, and rules about what a posture allows. This is the right home. "Walk With Me" and "high-stakes" are **postures, not new systems**.

The stray: `src/lib/operationalState.ts` is a second little state machine inferring `capturing/planning/executing/moving/ambient` from the current page. It's a duplicate concept with a hardcoded `movedRecently: false`. Retire it, don't extend it.

## 8. Cross-surface continuity — what's actually missing

Exists: shared `conversations` table; a resume notice keyed to scope + last-seen; carryable-vs-device-local context split; approval explicitly refusing to travel; receipts in one audit log; project continuity snapshots.

Missing for the "start on Telegram → finish anywhere" claim:
1. One shared transcript (kill the `telegram_messages` silo as the source of truth).
2. A first-class active-session/active-trip read that every surface consults.
3. Deep links that carry a thread or session id, not just a room name.
4. Server-side access to trips.

Until 1–4 exist, "continue anywhere" is marketing.

## 9. Proactive Telegram delivery

Better shape than expected. `suppress.ts` already does resolution recheck, groundedness, confidence floor, dedupe key, 3-day cooldown, snooze, "not important," acknowledged, quiet hours, 21-day staleness, and a real attention budget that raises the bar as volume climbs — with one escalation exception when a thing gets worse. `deliver.ts` already models `messaging` as a channel gated by two hard consents (you asked for it AND a chat is linked), and the drift sweep already maps that to Telegram.

So Telegram is *already* an eligible channel, not a second notification brain. The remaining mess: the actual Telegram POST is duplicated a third time inside `awareness-drift-sweep` instead of going through one sender. One sender, one place. That's the whole fix.

## 10. Do not build in the next pass

Background/always-on location. Geofencing. Autonomous SOS or emergency calling. Silent location sharing. Trusted-contact execution. Realtime public-safety or crime-risk scoring. Always-on listening or voice-in-ear. A fifth room or any new dashboard. A second posture/state machine. Live location trails.

## 11. Build order (short, consolidation first)

**A. Finish the name.** Kill the leftovers in §1 (fake email address, geocoder user-agent, `sw.js` tag, `ask_vanta` prompt token, three filenames). Freeze the legacy list in writing. Small.

**B. One brain for Telegram.** Route the webhook through `capabilityRouter` + `workingContext`, retire `applyIntentCore`'s parallel dispatch, attach provenance, write the transcript into the shared `messages` history, and send Telegram files through `fileIntake`. Collapse the three senders into one. This is the big one and it unlocks everything else.

**C. One place spine.** Merge the two geocode/nearby implementations behind `placeTruth`'s single precision policy (existing roadmap item 4).

**D. Trips become the shared session.** Make trips readable/writable server-side, expose "open trip" as state every surface reads, let Telegram start/append/end. No new tables, no new vocabulary — this is the Walk With Me foundation without calling it that.

**E. Posture, not moods.** Add `walk_with_me` and a high-stakes posture to the existing `Posture` type; retire `operationalState.ts`. Compression, interruption rules and tone read from the one place that already exists.

**F. Safety groundwork only.** Recognise high-stakes language in the router, present options, prepare an unapproved action, deep-link in with context. `location_shares` + trusted contacts + the honest re-negotiation of the "never shares where you are" promise are prerequisites, not deliverables.

**G. Then** the wider local-reality / travel / help-finding expansion, on top of one spine.

## 12. Street verdict

**What we've got:** a real spine, and a better one than most things claiming this. One action path that physically can't be born approved. A consequence preview that says "nothing has changed yet" and means it. A suppression pipeline with an actual attention budget, not vibes. A trip system that refuses to start itself and admits when it closed a trip late. A precision policy that says "neighbourhood" instead of lying about the street. That's grown-up work.

**What's close:** Telegram. It remembers you, it stages instead of executing, it talks in the right voice. It's got the manners. It just doesn't have the brain — it's the cousin who shows up to the family thing knowing everybody's name and none of the story.

**What'd be bullshit to claim today:** "Echo in your pocket." Not with two intent dispatchers, no working context on the phone, the transcript living in a separate table, three different ways to send a Telegram message, and a bot that literally cannot see your trips. And "continue anywhere" — you'd continue into a different conversation. Don't put that on a landing page yet.

**Before Walk With Me is real:** the router unification, trips readable server-side, one shared transcript, and a session id in the deep link. Four things. That's it. Not thirty.

**Safest SOS role for now:** the guy who hands you the loaded, unsigned paperwork and points at the door. Recognise the words, show the options, prepare the action, hand you into the app with everything loaded and nothing sent. Echo does not dial. Echo does not broadcast. And until there's a `location_shares` table with an expiry and a revoke button, Echo doesn't get to make promises about sharing at all — especially since the app currently tells the user out loud that it never will.

**Naming:** the outside world says Metro Echo and Echo. The wiring keeps its old tattoos. Nobody renames a database column, a signed webhook header, or a localStorage key for aesthetics — that's how you wipe a user's settings and break traffic with somebody else's platform to win an argument nobody was having. Public copy, prompts, and anything an outside service reads: fix it. Everything under the floor: leave it.
