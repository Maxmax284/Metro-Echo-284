# Vanta: The Street Audit (no code touched)

Everything below came from reading the actual repo. Where a file is named, the plain-English meaning follows it.

## 1. Where we really are

**Genuinely strong:**
- The shared brain pattern works. `src/lib/situation.ts`, `whySurfaced.ts`, `messageLane.ts`, `baseline.ts`, `arrivalRead.ts` are all one-line re-exports of the server versions — meaning Today, the Aware room, and Telegram literally run the same sentence-making code. That's the rare thing most products never get right.
- The awareness pipeline (`_shared/awareness/evaluate.ts`) is a clean pure function: signal → relevance → urgency → suppression → bundling → at most one nudge. Real architecture, testable, no I/O smuggled in.
- Approval discipline holds where it counts. Only `actions-transition` and `actions-execute` move a thing from staged → approved → executed. One door, one bouncer.
- 66 test files. That's not decoration, that's insurance.

**Half-built but looks finished:**
- Four rooms is the law, but the app has **eight extra full-page routes** outside it: `/watch`, `/motion`, `/glance`, `/wearables`, `/wearable-loop`, `/physical-loop`, `/how`, `/awareness/location`. Each one is a room wearing a fake mustache. Settings links out to four of them.
- Ten "advanced desks" (`inbox`, `memory`, `commitments`, `actions`, `schedule`, `briefs`, `projects`, `sherlock`, `awareness`, `command`) still mount full surfaces. `CommandCenterSurface` is 807 lines of a room that isn't in the doctrine anymore.
- Telegram never creates a conversation row. `telegram-webhook/index.ts:298` grabs your most recent existing thread; if you have none, `:443` silently drops the message from history. A Telegram-first user has amnesia and nobody told them.

**Duplicated:**
- **Three** competing "how much do I say" systems, each with a comment claiming to be the only one: `_shared/responseDepth.ts` (desk/phone/telegram/wrist/spoken), `_shared/awareness/compress.ts` (rich/brief/signal/spoken/cue), `src/lib/deviceCompression.ts` (fyi/meaningful/needs_you/critical). Three vocabularies for one idea.
- **Nine** places that create an action row by hand. No shared helper.
- **Two** Overpass/geocode implementations (`awareness-nearby-places`, `awareness-geocode`) with different cache grids — 5km in one, 110m in the other.
- `workingContext.ts` exists twice, hand-copied, magic numbers and all (the 12% tie margin lives in two files).

**Fragile:**
- `src/lib/useSignalRoute.ts:132` writes `risk: "medium"` / `"low"`. The database only accepts `low_reversible | standard | high`. That insert is wrong today.
- Six of nine action-insert sites don't attach `organization_id` (`Index.tsx:172`, `MemorySurface.tsx:191`, `SherlockOverlay.tsx:102,144`, `useSignalRoute.ts:126`, `CapturesView.tsx:384`). In a workspace, those actions quietly land as personal. That's the scope-isolation bug wearing new clothes.
- 15+ edge functions hardcode the model string instead of using `_shared/aiGateway.ts`. Swapping providers means 15 edits.
- Provider leaks into the UI: `useSystemControls.ts:48` says "Gemini / Lovable AI" and `awarenessPlainTalk.ts:119` prints "Gemini summary". Meanwhile `vantaIdentity.ts` swears Vanta isn't Gemini. Vanta's lying with one hand and confessing with the other.
- `SherlockOverlay.tsx:65` toasts "Sherlock failed" — the codebase's own rule two files over says never lead with that word.

## 2. Foundation work, ranked (before anything extravagant)

1. **One depth system.** Pick `awareness/compress.ts`'s vocabulary, make the other two adapters over it. Until then, wrist/Telegram/SOS all invent their own brevity.
2. **One action factory.** `stageAction(...)` on server + client. Fixes the enum bug, the scope bug, and the nine-copies problem in one move.
3. **Scope enforcement, not scope convention.** Every insert goes through the factory or a `withScope` wrapper; add a test that fails when a scoped table gets a raw insert.
4. **Telegram gets a real thread.** Create the conversation row; bind it to the channel link. No thread = no continuity = no companion.
5. **One place module.** Server-side `_shared/place.ts` owning Overpass, geocode, cache grid, and the precision rules currently living only in `placeTruth.ts` on the client. Right now the server can write a place that claims precision the client would refuse to say out loud.
6. **Route consolidation.** The eight orphan pages become drawers/desks inside Today/Work, or they die. This is the difference between "four rooms" and "four rooms plus a storage unit in Jersey."
7. **One model config.** All edge functions read `MODELS` from `aiGateway.ts`. Scrub provider names from every user-facing string.
8. **Capability router for Telegram.** Today only `vanta-converse` uses `_shared/orchestration/capabilityRouter.ts`; Telegram hand-rolls its own routing and has a *different tool list* (9 tools, only 4 shared by name). Two brains.

## 3. UI/UX: busy, hidden, technical, dead

- **Today** — 819 lines. The read leads now (good), but below it sit Find it fast, Needs attention, What's next, Security, What changed, Fresh in, plus body panel, source health strip, jump strip, quick modes, resume, bulletin, digest line. That's a newspaper, not a read. Ship one collapsed "Everything else" and let the read breathe.
- **Aware** — 640 lines, and it's a desk under Work reached through a tiny compass tile in `WorkSurface.tsx:319`. The most ambitious system in the product is behind the least confident door.
- **Ask** — solid. Widget and Ask are literally the same component (`ConversationSurface`), which is exactly right.
- **Widget** — same component, but no compression difference. A floating dock should speak shorter than a full room; today it doesn't.
- **Work** — desk grid is a launcher, not a room. Twelve tiles is a Start menu.
- **Receipts** — 388 lines, honest, probably the least broken room. Leave it.
- **Telegram** — correctly refuses in-chat approval ("Open Vanta to approve — nothing's been done yet"). That's the law working. But it can't say why it surfaced something the way the app can.
- **Settings** — eight groups, four of which link out to standalone pages. Users don't know if they're in Settings or a new app.
- **Dead scaffolding** — `CommandCenterSurface` (807 lines), `SherlockSurface` (479) vs the always-on overlay, `MemorySurface` vs `InboxSurface` fetching the same rows.

## 4. Presence and character

Already there: `motion.ts`, `motionPrefs.ts`, `skins.ts`, `haptics.ts`, `flip.ts`, room crossfade, `vantaIdentity.ts` with real refusal answers.

Push harder without going Vegas:
- **Timing as character.** Vanta pausing half a beat before a hard line reads as thought. Free personality, zero pixels.
- **Room temperature.** Each room already has a graffiti tag; give each one a distinct *quiet* state instead of a distinct decoration.
- **Silence with posture.** "You're clear." should look composed, not empty. One line, generous space, no icon graveyard.
- **Receipts as physical objects.** `ReceiptUnfold` is the best character device in the app. Reuse that grammar for consequence previews.
- Don't: mascots, typing dots pretending to think, emoji moods, celebratory confetti, streaks.

## 5. Ask + Widget + Telegram

Ask and the widget are one Vanta — same component, same thread store, same `vanta-converse`, same voice, same approval UI. Telegram is the cousin who shows up at Thanksgiving:

| | Ask/Widget | Telegram |
|---|---|---|
| Thread row | creates | never creates (`:298`, `:443`) |
| Context | `_shared/workingContext.ts` | hand-built inline `:305-355` |
| Routing | `capabilityRouter` | ad hoc |
| Tools | 10 | 9, only 4 overlap |
| Files | `files-ingest` | inline insert `:872` |
| Identity guard | prompt only | deterministic `:284-294` |
| Approval | in-chat | correctly refused |

Same tables, same tone, different nervous system.

## 6. Awareness: what it can honestly support

**Can:** honest place naming with precision and source, saved places, deliberate trips, arrivals lane with read/summary/next step, source health, deliberate image/page perception, one-nudge-at-a-time delivery.

**Cannot yet:** continuous position, geofenced triggers, nearby-truth at street precision, anything time-critical (nudges are polled, not pushed), server-side precision honesty.

**Dangerous to bolt on now:** SOS or Walk With Me on a stack with no server-side location truth and no realtime channel. A panic button that's polling is a lawsuit with a nice animation.

## 7. Engine room: the spaghetti risks

Ranked by how badly they'd split Vanta into multiple brains: depth vocabularies (3), action creation (9 sites), Telegram's parallel routing + tool list, place logic in two functions plus client-only rules, model strings in 15 functions, workingContext copied by hand, provider names in UI, "Sherlock" in an error toast, six unscoped action inserts, one invalid enum write.

Notably clean and worth protecting: OCR and transcription have exactly one path each (`_shared/pageRead.ts`); the awareness pipeline has exactly one scorer.

## 8. Where future capabilities plug in (map only)

- Local reality / official context → a `SignalAdapter` on `_shared/awareness/signal.ts`, same as calendar.
- Public-safety / incidents → same adapter seam, urgency `critical`, straight into `suppress`/`deliver`.
- SOS / Walk With Me → an **action** with its own risk tier through `actions-transition`, plus trips as the session container. Not a new subsystem.
- Help-finding / resource narrowing → `crossref.ts` (evidence + provenance + review gate). It already does exactly this shape.
- Travel state → `VantaContextProvider` posture, alongside device class.
- Contextual reminders by place → `awareness_places` + existing reminder path; the trigger is a signal, not a new engine.
- Trusted circle → `organizations`/`organization_members` + `privacy_settings`. Never a new sharing model.
- Physical-object comparison → `objectLife.ts` + `document_versions` versioning grammar.
- Resilience mode → posture value + a delivery profile in `deliver.ts`.
- Business layer over CampCore/CampStay → `external-platform-inbound` + `outbound_bridge_deliveries`. Capture in, drafts only, approval inside Vanta.

## 9. Do not touch yet

Realtime alerts, SOS, background location, public-safety feeds, trusted-circle sharing, transport disruption, voice-in-the-ear, a fifth room, any new dashboard. All of them need the same missing pieces: one depth system, server-side place truth, a push channel, and scope you can trust.

## 10. Build order

**Stage A — Stop the bleeding.** Action factory; enum fix; six unscoped inserts fixed; provider names out of UI; "Sherlock failed" toast reworded.
*Accept:* one insert path, a test that fails on raw inserts into scoped tables, zero provider names in user-visible strings.

**Stage B — One voice depth.** `awareness/compress.ts` becomes the base; `responseDepth` and `deviceCompression` become thin adapters.
*Accept:* one enum for depth; wrist, Telegram, widget and desk all derive from it; snapshot tests per form.

**Stage C — Telegram becomes a twin.** Real conversation row, shared `workingContext`, shared capability router, one tool list, `files-ingest` for uploads.
*Accept:* a Telegram-only user has full history; the same question gets the same answer in Ask and Telegram, different length only.

**Stage D — One place spine.** `_shared/place.ts`; precision rules enforced server-side; both geocoders merged with one cache grid.
*Accept:* no place row can claim precision its fix doesn't support; one Overpass path.

**Stage E — Room consolidation.** Orphan routes folded into Today/Work; `CommandCenterSurface`, `SherlockSurface`, `MemorySurface` overlap retired; Today's blocks collapsed behind the read.
*Accept:* four rooms and Settings, nothing else top-level; Today shows read + at most three blocks by default.

Only after E do we talk about real-world awareness.

## 11. Street verdict

Vanta is already a real thing — not a chatbot with a database strapped to it. The read, the one-nudge rule, the staged-approve-execute door, the receipts: that's a companion with a spine, and honestly most products never get there.

But right now Vanta's got one heart and three mouths. Three depth systems, nine ways to make an action, Telegram running its own separate brain, and a location layer where the client tells the truth while the server shrugs. Plus eight pages living outside the four-room law like squatters in a building you swore was fully leased.

If we throw Metro Echo on top of this today, here's what happens: SOS gets built on polling, place-based alerts get built on a geocoder that caches at 110m in one function and 5km in another, the safety copy gets its own fourth brevity vocabulary because nobody could pick from the three we have, and half the new actions land in the wrong workspace silently. Then some poor bastard hits the panic button and Vanta responds four minutes later with an eleven-line paragraph about a meeting.

Stages A through E. It's boring, it's mostly deleting and merging, and it's the only version of this where the ambitious stuff doesn't collapse under itself.
