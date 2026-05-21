# Sherlock 3 — Ambient Recognition Layer

Doctrine: Sherlock recognizes. Vanta organizes. The user decides. No silent execution, confidence + rationale always visible, full audit trail.

We already have: `sherlock_findings_cache`, `SherlockOverlay`, `SherlockContext`, `SherlockChipTrigger`, `SherlockSuggestionChip`, `useSherlockCache`, edge functions `sherlock-investigate`, `sherlock-watch`, `_shared/sherlockSuggest`, and chips embedded in Captures, Commitments, Actions, Memory, EntityDetailSheet. This plan upgrades that foundation into a lifecycle-managed, cross-surface, hub-anchored recognition system.

## Architecture shift

- Treat Sherlock as a service layer with **5 modes**: `observe | extract | relate | suggest | investigate`.
- Current cache stays as the fast read layer; add a durable **finding + suggestion lifecycle** table so accept/dismiss/cooldown/audit work everywhere.
- Sherlock page stays, repurposed as the **Recognition Center** (Hub).

## Phasing (6 batches, each shippable)

### Batch 3A — Schema + Lifecycle foundation

- New table `sherlock_findings` (durable, per-finding):
id, user_id, source_object_id/type, mode, finding_type, summary, extracted_data jsonb, suggested_action, suggested_relation_type, target_object_id/type, confidence (low/med/high), rationale, status (pending/accepted/edited/dismissed/expired), surface_origin, sensitive_flag, cooldown_until, created_at, updated_at, reviewed_at, reviewed_by, audit_event_id.
- New table `sherlock_suggested_relations` (or reuse `entity_relations` with `created_by='sherlock'` + `status`).
- RLS: owner-only. Trigger: `set_updated_at`. Indexes on (user_id,status,updated_at), (source_object_id), (target_object_id).
- Audit event types added: `sherlock_finding_created`, `sherlock_suggestion_accepted/edited/dismissed`, `sherlock_relation_accepted/dismissed`, `sherlock_investigation_started/completed`, `sherlock_sensitive_file_flagged`, `sherlock_manual_scan_requested`, `sherlock_auto_suggestion_suppressed`.
- Shared TS helpers in `src/lib/sherlock/` and `supabase/functions/_shared/sherlock/` for: create finding, accept, edit, dismiss (with cooldown), expire, list-by-source, list-pending.
- Extend `_shared/sherlockSuggest.ts` to persist into `sherlock_findings` in addition to the cache.

### Batch 3B — Recognition Surfaces (embedded chips/cards)

Use a shared `<SherlockFindingCard>` (confidence dot, rationale tooltip, Accept/Edit/Dismiss/Inspect). Mount on:

- Capture Inbox items (observe + suggest route).
- File cards (`FileUploadCard`, `MemoryFilesView`) — extract facts + suggested links/actions.
- Telegram capture cards (intent + suggested draft).
- `CommitmentDetail` (stale/snooze loop + "break down").
- `ReminderDetail` (cluster attach).
- `EntityDetailSheet` — upgrade `RelatedEntitiesSection` to show pending Sherlock-suggested links with reason + confidence (already partially present).
- `DailyBriefingCard` — "best first move" rationale line driven by Sherlock signal (already partially present, formalise).
- Aware results — context attach chip.

All chips honour `showWhenEmpty={false}`. No high-impact action without confirm modal.

### Batch 3C — Sherlock Hub upgrade (Recognition Center)

Rework `SherlockSurface.tsx` into tabbed Hub:

- **Pending Suggestions** (default) — cross-surface queue with Accept/Edit/Dismiss/Inspect, source link, confidence, rationale, created_at, surface_origin.
- **Findings** — grouped by source type (Files/Captures/Messages/Commitments/Entities/Aware/Canvas/Briefings).
- **Low Confidence** — separate triage.
- **Investigations** — keep current investigate flow here; user-triggered only.
- **Dismissed** — with cooldown badge + "re-run" action.
- **Patterns** — recurring topics / stale / snoozed-too-much / no-next-action / duplicate captures / clusters with unresolved items.
- **Sources** — origin counts and quick filter.
- **Settings / Rules** — small panel: ambient on/off, low-conf visibility, sensitive caution on, dismissed cooldown days, show in Canvas, show in Briefings. Persist to a `sherlock_settings` row (or user_preferences jsonb).

Keep the existing chat-style investigate UX, but as one tab — not the whole page.

### Batch 3D — Canvas integration

- Graph: dashed edges for `status='pending'` suggested relations, solid for accepted/manual; low confidence visually quieter; tap edge → review sheet with Accept/Dismiss.
- Cards view: Sherlock badge when findings exist, show route/relation.
- Timeline: render sherlock events (suggestion created / accepted / dismissed).
- Board: suggested-action lane for med/high confidence; never auto-move.
- Selection actions: "Ask Sherlock about this cluster" / "Investigate selected" → user-triggered investigate run.

### Batch 3E — Patterns engine

- New edge function `sherlock-patterns` (cron-friendly, but user-pull as well) that scans:
recurring topics, snooze-count thresholds, stale commitments, items missing next action, near-duplicate captures (hash + embedding cheap match), clusters with unresolved items.
- Emits `observe`-mode findings into `sherlock_findings` with rationale. Powers Hub → Patterns tab.

### Batch 3F — Sensitive content discipline

- `sensitive_flag` heuristics in extract (financial / medical / legal / ID-like / payment proof / security alert keywords).
- Cautious preview component: minimal summary, no auto-route, explicit confirm modal for any action.
- Manual "mark sensitive" on file/capture/note cards.
- Audit `sherlock_sensitive_file_flagged`.

## Voice & guardrails

- Extend `vantaVoice.ts` with a `vantaSay.sherlock` bank covering observe/extract/relate/suggest copy (forensic, calm, confidence-aware). Add guardrail test entries banning "solved the case", "I took care of it", "definitely belongs", and any high-certainty phrasing when confidence ≠ high.

## Cooldown rule

A dismissed suggestion is suppressed until: cooldown_until elapses, OR source object materially changes (hash diff), OR user manually re-runs. Enforced in the shared "create finding" helper — it checks for an existing dismissed finding with same (source_object_id, suggested_action, target_object_id) and either skips or writes `sherlock_auto_suggestion_suppressed`.

## Files

**New**

- `src/components/sherlock/SherlockFindingCard.tsx` — shared accept/edit/dismiss/inspect card.
- `src/components/sherlock/SherlockReviewModal.tsx` — high-impact / sensitive confirm.
- `src/components/sherlock/hub/` — `PendingTab`, `FindingsTab`, `LowConfidenceTab`, `InvestigationsTab`, `DismissedTab`, `PatternsTab`, `SourcesTab`, `SettingsTab`.
- `src/lib/sherlock/lifecycle.ts` — create/accept/edit/dismiss/expire helpers + cooldown.
- `src/lib/sherlock/types.ts`.
- `src/hooks/useSherlockFindings.ts`, `useSherlockPending.ts`, `useSherlockSettings.ts`.
- `supabase/functions/_shared/sherlock/lifecycle.ts`.
- `supabase/functions/sherlock-patterns/index.ts`.

**Edited**

- `src/components/surfaces/SherlockSurface.tsx` → Hub shell with tabs.
- `src/components/sherlock/SherlockContext.tsx`, `SherlockChipTrigger.tsx`, `SherlockSuggestionChip.tsx`, `useSherlockCache.ts` → write/read through lifecycle.
- `src/components/entities/RelatedEntitiesSection.tsx`, `EntityDetailSheet.tsx`, `CommandCanvas.tsx`, `CanvasCardsView.tsx`, `CanvasTimelineView.tsx`, `CanvasBoardView.tsx`, Graph view.
- `src/components/memory/CapturesView.tsx`, `MemoryFilesView.tsx`, `FileUploadCard.tsx`.
- `src/components/schedule/DailyBriefingCard.tsx`, `CommitmentDetail`, `ReminderDetail`, Telegram capture cards.
- `src/lib/vantaVoice.ts`, `src/test/voice-guardrail.test.ts`.
- `supabase/functions/_shared/sherlockSuggest.ts`, `sherlock-investigate`, `sherlock-watch`, `briefing-compose`, `telegram-webhook`, `files-ingest`.

**Schema**

- Migration adding `sherlock_findings`, `sherlock_settings` (or jsonb on profiles), RLS, indexes, audit event types.

## Risk notes

- Big surface area; we ship per-batch with tests so nothing regresses.
- Cache vs lifecycle table dual-write — lifecycle is source of truth, cache stays for fast reads.
- Patterns engine cost — bound to cheap heuristics initially, no LLM in the loop until user triggers Investigate.
- Canvas graph rendering of dashed/quiet edges needs perf check on large graphs.

## Intentionally deferred

- WhatsApp surfaces (per doctrine).
- Auto-cron for patterns engine (ship on-demand first, add schedule later).
- Embedding-based duplicate detection (start with hash + token match, upgrade later).

## Testing

Unit + RLS for lifecycle helpers; voice guardrails; cooldown behaviour; sensitive flag suppression; no-auto-execute integration tests for Telegram + briefing + canvas. Manual checklist mirrors PART 13 of the spec.

## Acceptance criteria mapping

Each PART 15 bullet maps to one of batches 3A–3F. Final acceptance after all 6 ship.

---

**Suggested execution order:** 3A → 3B → 3C → 3D → 3E → 3F. Run two together when safe (e.g. 3A+3B, then 3C, then 3D+3E, then 3F).

&nbsp;

“Approve this Sherlock 3 plan. Proceed with Batch 3A first. If safe and the diff stays controlled, include the shared SherlockFindingCard foundation from 3B, but do not implement the full hub, Canvas integration, patterns engine, or sensitive-content expansion until the lifecycle layer is migrated and tested. Keep Sherlock ambient, review-first, confidence-visible, and audit-backed. No silent execution.”