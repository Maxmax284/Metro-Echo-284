# Vanta Next-Stage Maturity — Staged Plan

The uploaded spec defines 8 phases. Per its own rules ("Do not build everything at once… ship each phase before the next"), this plan locks in the sequence and scopes **Phase 1 (Voice Sweep Completion)** as the first shippable chunk. Later phases get one-paragraph stubs so you can see the whole arc, but each will get its own dedicated plan when we get there.

---

## Sequence (locked)

1. Voice Sweep Completion ← **next**
2. File Intake Maturity
3. Sherlock 2 Surface-Wide Recognition
4. Capture Inbox V2
5. Relationship & Entity Detail Polish
6. Briefings V2 Polish
7. Command Canvas Maturity
8. Ecosystem Hooks Roadmap Hardening

No WhatsApp. No new paid APIs. No auto-execution. No dashboard bloat.

---

## PHASE 1 — Voice Sweep Completion (this PR)

### Goal

Every user-facing string reads like the Default Operator Voice already codified in `vantaVoice.ts`. No generic chatbot residue, no productivity-app hype, no robotic apologies.

### Approach

**1. Extend** `src/lib/vantaVoice.ts` with surface-specific phrase banks the spec calls out:

- `vantaSay.emptyCaptures()`, `emptyCommitments()`, `emptyFiles()`, `emptyBriefing()`, `emptyActions()`, `emptyMemory()`
- `vantaSay.errorGeneric(what, doWhat)` — replaces "Something went wrong"
- `vantaSay.askToSort()`, `askToStructure()`, `askForFollowThrough()` for chat/capture prompts
- `vantaSay.sherlockObserved(kind)`, `sherlockSuggests(action)` with confidence-aware variants
- Reminder/Telegram imperatives (verb-first, no cute)

**2. Audit + rewrite copy across these surfaces** (greps then targeted edits — no logic changes):

- Shell: `AmbientHeader`, `SurfaceTabs`, `ConversationDock`, `ModeBadge`, `AwarenessHUD`
- Capture Inbox: `MemorySurface`, `CapturesView`, `CaptureCard`, `MemoryFilesView`, `RecognizePanel`, `CorrectionsCenter`
- Commitments / Actions: `CommitmentsSurface`, `CommitmentActions`, `ActionsSurface`, `ReminderComposer`
- Sherlock: `SherlockSurface`, `SherlockOverlay`, `AnalyzeButton`
- Aware: `AwarenessSurface`, `SignalCard`, `LayerChips`, `BadLocationRecoveryPanel`, `SectionDrawer`
- Briefings: `DailyBriefingCard`, `ScheduleQueryChips`, `ScheduleSurface`
- Canvas: `CommandCanvas`, `CanvasCardsView`, `CanvasTimelineView`, `CanvasBoardView`, `EntityDetailSheet`, `EntityChips`
- Telegram / push: `TelegramLinkCard`, `telegram-webhook` reply strings, `push-test`, `commitment-reminders`
- Settings / install: `Settings`, `InstallVantaSection`, `PushReadinessSection`, `TimeRemindersSection`, `FileUploadCard`, `EmailInboxCard`, `ExecutorsCard`
- Auth + errors: `Auth`, toaster fallbacks, `vantaToast.fromError`

**3. Forbidden-phrase guardrail test**  
Extend `src/test/voice-guardrail.test.ts`:

- Walk `src/` and `supabase/functions/` for the spec's banned strings ("How can I help you today?", "As an AI assistant", "Something went wrong", "Unlock your productivity", "Let's get organized", "Seamless experience", "Boost your workflow", "Certainly!", "I apologize", "I'd be happy to", "Great job staying organized", "Optimize your workflow", "Your productivity journey").
- Fail the build if any reappear. Allow-list `vantaVoice.ts` itself (where the forbidden list lives as data).

**4. Tone rules per surface** baked into the phrase helpers, so future code defaults to the right register:

- Chat = direct, short
- Briefings = tight narrative, lead with best first move (already wired)
- Sherlock = forensic + named confidence, never executes
- Aware = locational, source-aware, no travel-blog
- Telegram = compact, verb-first, no link previews
- Reminders = imperative + context
- Errors = what broke / what to do
- Empty states = invitation, not apology
- Canvas = quiet labels and counts

### Out of scope for Phase 1

No new features, no schema changes, no edge-function logic changes (only string edits inside functions). Sherlock behavior, file routing, briefing composition logic, Canvas views — all untouched.

### Files expected to change

- `src/lib/vantaVoice.ts` (extended)
- `src/test/voice-guardrail.test.ts` (extended)
- ~25–35 component files: targeted string replacements only
- A handful of edge functions for outgoing reply text (Telegram, push)

### Acceptance criteria (from spec)

- Every major surface uses the Default Operator Voice
- No banned phrases (enforced by test)
- Sherlock stays investigative; Aware stays practical; Telegram stays compact; errors stay clear; canvas stays quiet
- No exclamation-mark happy-talk

### Risks

- Copy churn touches many files → keep diffs minimal, no refactors riding along
- Risk of changing a string a test asserts on → run tests after the sweep
- Some strings live in edge functions; need to redeploy (automatic)

### Deferred (intentionally)

- File intake schema/extraction (Phase 2)
- Sherlock cross-surface recognition (Phase 3)
- Inbox triage UI upgrades (Phase 4)
- Relationship reasons/source labels UI (Phase 5)
- Briefing scope variants — project/person/place (Phase 6)
- Canvas Flow/Map views (Phase 7)
- Ecosystem adapters (Phase 8)

---

## Phases 2–8 (stubs, planned separately)

- **Phase 2 — File Intake**: extend files schema with detected type / entities / sensitive flag / review status, add Sherlock-driven extract pass on upload, triage actions in Capture Inbox, sensitive-file caution copy, audit events on every route.
- **Phase 3 — Sherlock Surface-Wide**: formalize Observe/Extract/Relate/Suggest/Investigate, surface on capture/file/message/commitment/entity/briefing/canvas/Telegram cards, confidence-visible suggestions only.
- **Phase 4 — Capture Inbox V2**: state machine (New/Needs review/Suggested/Routed/Attached/Archived/Ignored/Waiting/Stale), source + suggested-type + confidence chips, mobile-first scan.
- **Phase 5 — Relationship Polish**: relation reasons, inbound/outbound grouping, filter by type, manual attach/detach, dismissed-link cooldown, full relation audit trail.
- **Phase 6 — Briefings V2 Polish**: morning/evening/project/person/place variants, object citations with open-from-briefing, tighten copy further.
- **Phase 7 — Canvas Maturity**: card metadata expansion, timeline filters, board high-risk approval phrase preserved, graph filters + dashed-suggestion rendering on mobile. Flow/Map stay deferred.
- **Phase 8 — Ecosystem Roadmap Hardening**: per-source event schemas + read-only adapter strategy + approval rules for Website / GroundStay / CampCore / Fenrir / Calendar / Email / Voice / Maps. Doc-only. No WhatsApp.

After Phase 1 ships, I'll come back with a dedicated plan for Phase 2.

&nbsp;

Proceed with Phase 1 — Voice Sweep Completion only.

Keep this PR limited to centralized voice helpers, user-facing copy cleanup, and the voice guardrail test. No schema changes, no new features, no behavior changes, no refactors riding along.

Use vantaVoice.ts / vantaSay.* as the central source for the Default Operator Voice. Sweep the listed surfaces for generic chatbot/productivity copy and replace it with Vanta-native language.

Extend the guardrail test so banned phrases cannot come back, with vantaVoice.ts allow-listed only where the forbidden list is stored as data.

After Phase 1 ships, return a report showing files changed, phrases replaced, tests added/updated, any remaining copy debt, and whether it is safe to move to Phase 2.

Street version: make Vanta sound like Vanta everywhere, but don’t touch the engine while painting the body.