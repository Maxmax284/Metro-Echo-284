## Sequenced plan — Aware polish → Voice Layer → Canvas/Sherlock 2 roadmap

Three phases. Ship each one before starting the next. No mega-merge.

---

### Phase 1 — Aware production polish (ship this first)

Goal: usable, intelligent, mobile-safe, timezone-clean, calm in Telegram. No new modules.

**1.1 Mobile layout pass for** `AwarenessSurface.tsx`

- Add `useIsMobile()` branching so phone view stacks: sticky place strip → primary action (Scan / Recenter / Switch) → briefing card → layer chip row (horizontal scroll) → selected layer detail → recovery panel (conditional).
- Hide `AwarenessHUD` radar on mobile by default; expose under a "Show radar" toggle. On desktop keep current hero treatment.
- Increase tap targets to ≥40px in the place strip (currently h-9, several text-[10px] chips). Bump strip chips to text-[11px], pad y-1.
- Replace the dense 3-line place strip with: line 1 label + tier chip, line 2 status sentence, line 3 single primary action + overflow menu (Switch / Sources / Fix). Move source badges into the overflow on mobile.
- Add bottom-safe padding that accounts for `ConversationDock` + Telegram floating button (audit `pb-36` is enough; verify against `safe-bottom`).
- Layer chips: ensure horizontal scroll with snap + edge fade. Keep "All layers" reset visible.
- Acceptance: no horizontal overflow at 360/384/414/430px; no text under 11px; radar hidden by default on phone; primary action always above the fold.

**1.2 Deeper local intelligence in** `awareness-snapshot` **+** `awareness-brief`

- Snapshot: for `exact`/`saved` tier, increase Google Maps `local_results` slice from 5 to 8 and capture rating, user_ratings_total, hours, price level, type. Add a second targeted SerpApi query per chip context (transport/payments/safety) when tier ≥ city, gated by existing `runGuarded` + cache.
- Snapshot: add a lightweight "place_signals" array (top 3 named venues with type, rating, distance) and persist in `full_data.place_signals` for downstream cards to cite.
- Brief: extend `SECTION_KEYWORDS` (Thai/SEA-specific terms — PromptPay, songthaew, 7-Eleven, BTS/MRT, Grab/Bolt, etc.) and add a "named entity prefer" rule so summaries cite actual venue names from `place_signals` instead of generic chatter.
- Brief: when slice is `none` but tier is `country`/`city`, add country-level common-knowledge fallback paragraph (existing rule) plus a one-line "what would unlock this card" hint (e.g. "tap Recenter to use exact GPS").
- Acceptance: scanning a real address surfaces named venues + concrete numbers, not just Reddit chatter.

**1.3 Timezone verification end-to-end**

- Audit chain: browser → `useUserTimezone` → `profiles.timezone` → reminder composer (`buildLocalDate` in `src/lib/timeRules.ts`) → DB `remind_at` UTC → `commitment-reminders` `composeTelegram` (re-formats with `prof.tz`).
- Add a `tz_resolution` audit event at reminder creation capturing `{source: "device"|"profile"|"default", tz, utc, local_render}`.
- Add a settings diagnostic in `TimeRemindersSection.tsx`: shows detected device tz, saved profile tz, mismatch warning, "Use device tz" one-tap fix.
- Add tests covering: profile tz set, device tz drift, DST boundary, midnight wrap (quiet hours), missing tz fallback.
- Acceptance: scheduling "5pm" while in Asia/Bangkok always delivers at 17:00 ICT and renders "5:00 PM Asia/Bangkok" in Telegram, regardless of which device created it.

**1.4 Clean Telegram reminders**

- Rewrite `composeTelegram` in `supabase/functions/commitment-reminders/index.ts`:
  - No raw URL in the message body (causes giant link preview cards).
  - Use `sendMessage` with `disable_web_page_preview: true` and `reply_markup.inline_keyboard` instead — buttons: "Open in Vanta" (url), "Mark done" (callback), "Snooze 1h" (callback).
  - Keep header/when/note lines plain text. Trim snippet to 160 chars.
- Add a `telegram-callback` handler (or extend `telegram-webhook`) to process `callback_query` for mark-done and snooze. Both write through existing commitment update + audit path.
- Acceptance: reminder arrives as compact text + 3 buttons, no preview card; tapping Done closes the commitment with an audit entry.

Phase 1 ships when 1.1–1.4 pass on a real phone at 384px against a real place (Lamai/Bangkok test).

---

### Phase 2 — Default Vanta Voice Layer (after Phase 1)

Goal: every surface — chat, reminders, briefings, Sherlock, Aware, Telegram, empty states, errors — sounds like the same calm operations companion. Not a new persona; a centralization + sweep.

**2.1 Tighten the voice spec**

- Update `src/lib/vantaVoice.ts` header comment + `VANTA_VOICE_RULES` constant to encode the uploaded "Default Operator Voice" spec verbatim (tone, style, response shape, avoid list).
- Mirror in `supabase/functions/_shared/vantaVoice.ts` `VANTA_CORE_VOICE`. Keep both files canonical; add a comment that they must stay aligned.
- Remove residual emoji from default phrases (📝, ⏰) — push them into Telegram-only success acknowledgements via a separate `vantaSay.telegram.*` namespace.

**2.2 Add missing phrases, drop generic strings**

- Sweep the 40+ files using `vantaSay`/sonner toasts. Anywhere a raw string is passed to `toast`, `alert`, or empty-state copy, replace with a `vantaSay.*` entry (extend the library as needed).
- Add empty-state copy for: Schedule, Briefings, Files (typed/untyped), Push readiness, Telegram link unpaired, Sherlock idle, Corrections center idle.
- Add error-state copy for: edge function 500s, AI gateway 402/429, geocode miss, Telegram delivery failure.

**2.3 Edge-function voice consistency**

- `vanta-converse`, `telegram-webhook`, `awareness-brief`, `awareness-query`, `sherlock-investigate`, `notes-assist` — verify each uses `COMPANION_VOICE`/`AWARENESS_VOICE`/etc. plus the new core spec. Strip anything that smells like generic chatbot ("As an AI…", "I'd be happy to…", "Certainly!").
- Add `VANTA_RESPONSE_SHAPE` constant ("Here's what I found / what matters / what it connects to / what you can do next / what needs approval") and inject into Companion + Awareness system prompts.

**2.4 Voice guardrail tests**

- Extend `src/test/voice-guardrail.test.ts` with regex deny-list: `as an ai`, `i apologize`, `unlock your productivity`, `let's optimize`, `great job`, `absolutely`, trailing `!`.
- Add a sample-prompt snapshot test against `awareness-brief` system prompts to catch regressions.

Phase 2 ships when every surface reads the same character — sharp, calm, useful, no chatbot residue.

---

### Phase 3 — Command Canvas / Sherlock 2 strategic roadmap (architecture, not full build)

Goal: a staged plan for the interactive/recognition layer. Document + minimal foundation only. No Canvas UI yet.

**3.1 Object & relationship model (foundation — build now)**

- Schema: `entities` (id, user_id, kind, title, metadata, created_at) — kinds: note, file, message, capture, reminder, commitment, action, place, person, signal, sherlock_finding, research_object.
- Schema: `entity_links` (id, user_id, from_entity, from_kind, to_entity, to_kind, relation, confidence, source, created_at) — relations: `mentions`, `follows_up`, `derived_from`, `attached_to`, `about_place`, `about_person`, `duplicates`.
- Backfill: write adapters for existing tables (notes, commitments, etc.) so they project into the entity view without copying data. Read-only views first, write paths later.
- Reuse existing `note_links` where it overlaps; do not duplicate.

**3.2 Sherlock 2 recognition layer (spec, partial build)**

- Spec doc: define recognition (passive pattern detection over captures + entities) vs investigation (explicit user-triggered deep dive). Recognition = suggestions only, never executes.
- Build minimum: a `sherlock-recognize` edge function that runs nightly + on-demand over the last N captures, emits `suggested_links` rows with confidence + rationale, surfaces in Memory + Attention queue as draft links the user accepts/rejects.
- Defer: Sherlock 2 UI overhaul, multi-step reasoning chains, autonomous investigation expansion.

**3.3 Relationship cards + timeline + board (spec only)**

- Spec: Relationship card = entity detail with inbound/outbound links grouped by relation. Timeline = chronological strip per entity. Board view = per-place or per-person kanban of related items.
- Decision: these all consume `entities` + `entity_links`. Do not build until 3.1 is live and populated.

**3.4 Command Canvas (deferred — spec only, no build)**

- Spec: drag/drop control surface where users compose objects → relationships → actions visually. Sherlock suggests, user wires it up.
- Hard prerequisite: 3.1 stable, 3.2 emitting useful suggestions, 3.3 cards in production. Estimate 4–6 weeks after 3.3 before Canvas is worth starting.

**3.5 Roadmap doc**

- Write `docs/roadmap-canvas-sherlock2.md` capturing 3.1–3.4 with: scope, dependencies, acceptance criteria, what-not-to-build-yet, and the explicit ordering rule (no Canvas before model; no Sherlock 2 dump; no WhatsApp).

Phase 3 ships when the roadmap doc is in repo, entity/links schema is migrated and read-only adapters land. Everything else stays planned.

---

### Out of scope (all phases)

- WhatsApp bridge (Telegram first on Vanta, then GTH, then CampCore — per existing sequencing).
- Touching unrelated modules (Capture, Schedule, CampCore booking logic, etc.).
- New paid APIs beyond what `apiGuard` already brokers.
- Auto-execution from any messaging surface — capture stays capture.

### Technical notes

- All Aware UI work stays inside `AwarenessSurface.tsx` + `awareness/*` components + the two snapshot/brief edge functions. No provider-layer rewrites.
- Telegram inline keyboards need a `callback_query` branch in `telegram-webhook` and the same auth checks as message handling.
- Voice rule constants are duplicated in client/edge by design; the in-code comment must enforce sync. A small script can diff them in CI later.
- Entity/links schema uses RLS via `user_id` ownership; no roles tables involved.

Approve this sequencing. Proceed with Phase 1 — Aware production polish first.

&nbsp;

Do not start Phase 2 or Phase 3 implementation until Phase 1 passes acceptance testing on a real mobile device and Telegram reminder delivery is clean.

&nbsp;

Phase 1 should focus only on the concrete production polish items: mobile-first Aware layout, deeper practical local intelligence, timezone verification, and compact Telegram reminders with inline buttons and no giant link preview cards.

&nbsp;

After Phase 1 is shipped and verified, move to Phase 2 — Default Vanta Voice Layer. Centralize the platform voice across chat, reminders, briefings, Sherlock, Aware, Telegram, empty states, and errors. Keep it as Vanta’s default operator voice, not a new persona.

&nbsp;

After Phase 2 is shipped and verified, move to Phase 3 — Command Canvas / Sherlock 2 roadmap. Treat this as roadmap and foundation work only unless I explicitly approve deeper implementation. Entity/links schema and read-only adapters are okay. Full Canvas UI, Sherlock 2 overhaul, and advanced graph features should stay deferred.

&nbsp;

Keep the work staged, production-safe, and focused. No mega-merge. No WhatsApp yet. No unrelated module rewrites. No autonomous execution from messaging surfaces. Capture stays capture; the user approves execution.