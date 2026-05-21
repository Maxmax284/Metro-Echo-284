# Vanta Wave 1 — Remaining Maturity Work

Three phases, staged and production-safe. No Wave 2/3 work, no WhatsApp, no new ecosystem hooks, no silent execution. Capture feeds the system, the user decides, every route writes audit.

---

## Phase 1 — Voice Sweep Completion

Goal: every long-tail string sounds like the Default Operator Voice. Centralize through `vantaSay.*`, harden the guardrail.

**Audit pass**
- Grep `src/` and `supabase/functions/` for hardcoded toasts/strings outside `vantaVoice.ts`: `toast.success(`, `toast.error(`, `alert(`, raw `"Something went wrong"`, `placeholder=`, empty-state copy, button labels with apology/cheerleader tone.
- Areas to sweep (priority order):
  - Capture/Inbox: `CapturesView`, `CaptureCard`, `RecognizePanel`, `MemoryFilesView`, `EmailInboxCard`, `FileUploadCard`, `CorrectionsCenter`, `PrivacySettingsPanel`.
  - Sherlock: `SherlockFindingCard`, `SherlockReviewModal`, `SherlockOverlay`, `EmbeddedSherlockFindings`, `MarkSensitiveButton`, `AnalyzeButton`.
  - Schedule/Commitments/Actions: `DailyBriefingCard`, `ReminderComposer`, `CommitmentsSurface`, `ActionsSurface`, `CommitmentActions`.
  - Entities/Canvas: `EntityDetailSheet`, `RelatedEntitiesSection`, `EntityChips`, `CommandCanvas`, `CanvasCardsView`, `CanvasTimelineView`, `CanvasBoardView`, `CanvasFilters`.
  - Aware: `AwarenessSurface`, `AwarenessHUD`, `AttentionQueue`, `SignalCard`, `SourceStatusPill`, `BadLocationRecoveryPanel`, `MapPickerDialog`, `SectionDrawer`.
  - Settings: `TelegramLinkCard`, `PushReadinessSection`, `TimeRemindersSection`, `InstallVantaSection`.
  - Shell: `AmbientHeader`, `ConversationDock`, `ModeBadge`, `SurfaceTabs`.
  - Edge functions (Telegram replies, briefing, push-test): keep compact, verb-first, no detective cosplay.

**Phrase library additions (`src/lib/vantaVoice.ts` + edge mirror)**
- New groups: `inbox.*` (empty/needsReview/routed/stale/snoozed/ignored), `file.*` (reading/readAs/cantRead/sensitiveHold/extractedFacts), `sensitive.*` (mayContain/minimalPreview/reviewBeforeActing), `errors.*` (network/save/permission), `empty.*` (briefing/commitments/files/inbox/captures), `telegram.*` (paired/notPaired/sendFailed), `push.*` (notReady/blocked/sent).

**Guardrail expansion (`src/test/voice-guardrail.test.ts`)**
- Add forbidden patterns from the prompt that aren't yet covered: "How may I assist", "I'd be happy to", "Certainly!", "Great job staying organized", "Your productivity journey", "Let's get organized", "Boost your workflow".
- Add a positive-rule test: no `toast.success(` / `toast.error(` with bare string literals outside `VOICE_ALLOW`; they must call a `vantaSay.*` function.
- Confirm sensitive copy stays neutral (no "shady", "suspicious"-style words outside Sherlock rationales).

**Acceptance**: guardrail green; manual scan of each listed surface; Telegram + push messages remain under ~120 chars; sensitive copy stays cautionary.

---

## Phase 2 — Capture Inbox V2

Goal: turn `CapturesView` (ambiguous mode) into the real triage hub. Source-aware, status-aware, route history visible, no auto-routing.

**Schema (minimal migration)**
- New table `capture_routes` (audit-grade route history, in addition to `audit_log` events):
  - `id uuid pk`, `user_id uuid not null`, `capture_kind text` (message|file|field_note), `capture_id text`, `source text`, `suggested_route text`, `user_action text` (accepted|edited|dismissed|archived|attached|ignored), `previous_status text`, `new_status text`, `sherlock_finding_id uuid null`, `audit_event_id uuid null`, `created_at timestamptz default now()`.
  - RLS: owner-only `select/insert`.
- Extend `messages.metadata` and `ingested_files.metadata` conventions (no DDL needed): `triage_status` ∈ {new, needs_review, suggested, routed, attached, archived, ignored, waiting, stale}, `stale_since`, `last_action_at`. Backfill defaults in the hook.

**New components**
- `src/components/memory/CaptureInbox.tsx` — replaces ambiguous-mode of `CapturesView` (keep `CapturesView` as the read-only feed for Memory surface). Sections: Now / Needs review / Suggested / Waiting / Stale / Done. Filter chips: source, type, sensitive, sherlock-confidence.
- `src/components/memory/CaptureInboxItem.tsx` — single row with: source pill, time, title/summary, suggested-type chip, Sherlock confidence chip, suggested-route chip, related-entity chips, sensitive flag, status chip, last-action chip, action menu.
- `src/components/memory/CaptureRouteHistory.tsx` — drawer/sheet listing rows from `capture_routes` for that capture.
- `src/components/memory/CaptureBulkBar.tsx` — appears on multi-select; only safe bulk ops: Archive, Ignore, Mark reviewed, Send to Sherlock. No bulk route to commitment/reminder/action.

**Triage actions** (every action: optimistic state, audit_log insert, capture_routes insert)
- Save as note / Create reminder / Create commitment / Create action / Attach to existing item / Attach to person / Attach to place / Add to briefing / Send to Sherlock / Open in Canvas / Archive / Ignore / Mark reviewed / Dismiss suggestion / Edit route.
- Sherlock SUGGEST chip stays a draft; accept = route + history row; dismiss = history row with `user_action='dismissed'`.

**Stale logic**
- Client-side derivation in `useIntakeFeed`: `triage_status='stale'` if `new`/`needs_review`/`suggested` AND `created_at < now - 72h` (configurable in `useSherlockSettings`-style hook). Surface quietly in its own section; no toasts.

**Hook changes**
- Extend `useIntakeFeed` to read `triage_status`, `last_action_at`, related entities (already partially via `entityGraph`), and `capture_routes` count per capture.
- New `useCaptureRoute()` hook: wraps route action → status patch → audit_log → capture_routes insert.

**Sources covered**: manual, chat widget, Telegram, email inbound, files, screenshots, links, Aware signals, Sherlock findings. Voice notes + ecosystem events stubbed as future sources only.

**Acceptance**: prompt's 9-state model rendered; route history visible; every action writes audit + route row; nothing routes silently; mobile-friendly (chip wrap, sticky filter bar).

---

## Phase 3 — File Intake Maturity

Goal: files become structured operational objects with doc-type detection, extracted entities, suggested actions, sensitive discipline, and Sherlock integration.

**Edge function changes (`files-ingest`)**
- After text extraction, add **doc-type classifier** call (LLM, single Lovable AI Gateway request, strict JSON tool schema):
  - Output: `doc_type` ∈ {receipt, invoice, booking_confirmation, schedule, contract, waiver, id_passport, payment_proof, medical_note, travel_admin, screenshot, generic, unknown}; `confidence`; `extracted_entities` {dates, people, amounts, locations, payment_refs}; `summary` (one paragraph, neutral); `suggested_actions` (drafts only).
- Pre-classifier: run `_shared/sensitive.ts` `detectSensitive` on extracted text + filename. If sensitive: skip rich summary, store `minimal_summary` only, force `triage_status='needs_review'`, never produce `suggested_actions` with high confidence.
- Persist on `ingested_files.metadata`: `document_type`, `doc_confidence`, `extracted_entities`, `summary`/`minimal_summary`, `suggested_actions`, `sensitive`, `sensitive_categories`, `review_status` (pending|reviewed|ignored).
- Then call existing `sherlock-investigate` (extract mode) for the file's note so findings land in the normal Sherlock lifecycle.
- Audit events: `file.classified`, `file.sensitive_flagged`.

**No new edge function, no new paid API** — reuses Lovable AI Gateway.

**Client changes**
- `MemoryFilesView.tsx`: show doc-type chip, extracted-entity chips, sensitive Reveal toggle (already exists for Sherlock — reuse `SherlockFindingCard` pattern via `MarkSensitiveButton` + a `<RevealableSummary>` helper).
- `FileUploadCard.tsx`: voice-sweep only.
- `CaptureInboxItem` (Phase 2): file rows show doc-type + extracted-fact chip + suggested-action chip.
- New `src/components/memory/FileDetailSheet.tsx`: full file view with Summarize / Extract dates / Extract people / Extract amounts / Create reminder / Create commitment / Create action / Attach / Add to briefing / Send to Sherlock / Open in Canvas / Archive / Mark reviewed / Ignore / Mark sensitive / Reveal preview.
- Every action goes through Phase 2's `useCaptureRoute()` so file routes appear in `capture_routes` history.

**Sensitive rules**
- Reveal toggle hides summary, entities, suggested actions until tapped.
- All routing actions on sensitive files open `SherlockReviewModal`-style confirmation before commit.
- Sensitive copy uses `vantaSay.sensitive.*` from Phase 1.

**Acceptance**: receipt/booking/PDF/image/payment-proof uploads all classify; sensitive files render minimal preview; reminders/commitments can be drafted from extracted dates with explicit user approval; audit + route history written; no auto-route.

---

## Testing

- Extend `src/test/voice-guardrail.test.ts` (Phase 1).
- New `src/test/capture-inbox.test.ts`: state transitions (new→suggested→routed→done), stale derivation, route history insert.
- Extend `src/test/file-intake.test.ts`: doc-type detection branches, sensitive forced-review, suggested-action drafting never auto-executes.
- Smoke test: `bunx vitest run`.

## Manual QA (after build)

The 20-point checklist from the prompt: dashboard voice → inbox sources → route to note/reminder/commitment/action → archive → file uploads (PDF/image) → Sherlock extract → mark sensitive → reminder from file → attach file to commitment → audit trail → forbidden-phrase grep → confirm zero surprise automation.

## Non-Goals (explicitly deferred)

- WhatsApp, ecosystem adapters (GroundStay/CampCore/Fenrir), Canvas Flow/Map, productivity scoring, dashboard expansion, new paid APIs, voice-note ingestion, Sherlock hub settings (Wave 2), patterns cron (Wave 2), Canvas anti-spaghetti (Wave 2).

## Risks

- LLM doc-type classification can mislabel — mitigated by always surfacing confidence and never auto-routing.
- Capture state machine touches metadata across three tables — keep status derivation in one hook so we don't fragment truth.
- Guardrail tightening may flag existing copy — Phase 1 sweep must land before tightening tests or CI breaks.

## Technical Details

- Migrations: 1 new table `capture_routes` with RLS. No `auth.users` FK.
- Edge functions affected: `files-ingest` (classifier + sensitive gate + sherlock-investigate trigger). Others untouched.
- New files: `CaptureInbox.tsx`, `CaptureInboxItem.tsx`, `CaptureRouteHistory.tsx`, `CaptureBulkBar.tsx`, `FileDetailSheet.tsx`, `useCaptureRoute.ts`, `capture-inbox.test.ts`.
- Edited: `vantaVoice.ts` (+ edge mirror), `voice-guardrail.test.ts`, `useIntakeFeed.ts`, `CapturesView.tsx`, `MemoryFilesView.tsx`, `FileUploadCard.tsx`, `MemorySurface.tsx`, plus voice-only edits across the surfaces listed in Phase 1.

Implementation order: Phase 1 sweep → Phase 2 schema + Inbox V2 → Phase 3 file classifier + detail sheet → tests → manual QA → Wave 2 readiness call.
