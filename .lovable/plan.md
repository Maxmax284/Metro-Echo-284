# Proactive Awareness — Evaluator Pipeline + Communication Seams

## What already exists (verified)

- `nudges` table with per-user RLS, `organization_id`, `dedupe_key`, `priority`, `status` (pending/seen/dismissed/acted), `expires_at`.
- Three nudge writers: `ambient-pulse` (on app open, 8 kinds incl. drift), `sherlock-watch` (heat/pairing/quiet), `awareness-drift-sweep` (hourly cron, opt-in, one drift signal per scope).
- Pure detectors in `supabase/functions/_shared/drift.ts`: silent project, drifting commitment, unread risk, `rankDrift`, `isInQuietHours`, `scopedDedupeKey`, `driftScopeTargets`. Mirrored client-side via `src/lib/drift.ts`. 21 tests.
- Today already renders exactly one proactive row (`NoticedRow`) fed by `useTodayDigest`, with dismiss (`nudge.dismissed`) and follow (`nudge.followed`) audit events.
- `NudgesPanel` renders the older nudge list as a shell pill.
- Quiet hours live in `profiles.preferences`; opt-in flag is `proactive_awareness_enabled`.
- `corrections` table + `FeedbackBar` + `CorrectionsCenter` already exist for "wrong / not useful" feedback.
- Shared backend primitives exist: `_shared/http.ts`, `authContext.ts` (scope), `auditEvent.ts`, `aiGateway.ts`.
- One cron job exists (`vanta-drift-sweep`, hourly).
- Name collision to avoid: `VantaSignal` is already taken by the awareness/briefing contract in `src/lib/vantaSignal.ts`. The new model will be `AwarenessSignal`.

Honest gaps: relevance and urgency are hard-coded priority integers; suppression is only dedupe-key + quiet hours; there is no bundling, no cooldown-on-change, no resolution recheck, no attention budget, no shadow mode, no channel/delivery concept, and dismissal does not feed back into resurfacing.

## Deliverable 1 — Audit document

`.lovable/proactive-awareness-audit.md` recording the above: what exists, what is reused, what is duplicated (two nudge readers, three writers), what is genuinely proactive vs reactive, scope/quiet-hour compliance per writer, where duplicates can still occur, and what must not be touched (action lifecycle, four-room nav, push/reminder infra, Receipts).

## Deliverable 2 — The pipeline, as pure modules

New `supabase/functions/_shared/awareness/` with client mirrors under `src/lib/awareness/`:

```text
sources (existing data only)
  -> normalize   -> AwarenessSignal
  -> relevance   -> deterministic factor scores
  -> urgency     -> background | useful | attention | time_sensitive | critical
  -> suppress    -> dedupe, cooldown, ack, resolution recheck, quiet hours, decay
  -> bundle      -> group by project/entity
  -> deliver     -> { recommendedChannel, recommendedFormat }
  -> one Today nudge
```

- `signal.ts` — `AwarenessSignal` (id, source, type, scope, entity/project refs, timestamp, summary, previous/current state, confidence, sourceRefs, metadata) and the `SignalAdapter<T>` seam. Existing drift detectors become the first adapters; no adapter stubs for future sources.
- `relevance.ts` — impact, time sensitivity, change magnitude, continuity relevance, user intent (pinned/committed), confidence, current state. Deterministic, no AI.
- `urgency.ts` — five-level ladder, escalation-resistant: `critical` requires an explicit hard condition, never a score threshold.
- `suppress.ts` — dedupe key (scope-segmented), cooldown with escalation-on-change, acknowledgment memory from `nudges.status` + `corrections`, resolution recheck, staleness decay, attention budget (recent nudge/dismissal counts raise the bar for low-value signals).
- `bundle.ts` — related signals in one project collapse to "CampStay has 3 items needing attention"; unrelated high-urgency signals never merge.
- `deliver.ts` — `CommunicationChannel` / `CommunicationFormat` types and the ladder. Only `"today"` is live; every other channel is documented and returns nothing.

Urgency and delivery stay separate types. Scope is part of signal identity, every query, every dedupe key, every audit row.

## Deliverable 3 — Shadow mode before behavior change

`awareness-drift-sweep` and `ambient-pulse` both call the same evaluator. Every candidate writes one internal audit row (`entity_type: "awareness_eval"`, event `awareness.evaluated`) carrying normalized type, scope, relevance inputs, urgency, suppressed + reason, dedupe key, cooldown state, bundle group, delivery recommendation, and would-surface. No new table, no user-facing log, and these rows are filtered out of Receipts.

A `shadow_only` preference (default on for this phase) means the evaluator records but does not write nudges, so thresholds can be reviewed before Vanta gets more proactive. Existing drift nudges keep working unchanged while shadow runs.

## Deliverable 4 — Today, unchanged in shape

`NoticedRow` gains only what the doctrine requires: the plain-English "why am I seeing this" line, a bundle count when signals grouped, and a `Not important` / `Mark finished` pair alongside Dismiss that writes a `correction` so the signal does not come back unless urgency genuinely increases. Still one row, still a draft, still hands off to the owning surface. No second feed, no alert theatrics, no new tab.

## Deliverable 5 — Doctrine + future-channel documentation

`.lovable/awareness-communication-contract.md`: "Vanta earns interruptions" doctrine and the six questions; the format compression rule; desk / phone / earbud / wearable / ambient models; context-object seam (moving, driving, training, focus, earbuds present); telemetry adapter pattern; per-family telemetry opt-in and derived-state-over-raw-samples privacy rule; and the explicit boundary that personal telemetry is never medical diagnosis. Memory gets one Core line: Vanta earns interruptions.

## Explicitly not in this phase

No voice, wearables, phone push, location automation, health telemetry, autonomous actions, second notification system, generalized event platform, new cron, new tab, and no change to the four-room navigation or the Plan → Approve → Execute lifecycle.

## Technical notes

- New: `supabase/functions/_shared/awareness/{signal,relevance,urgency,suppress,bundle,deliver}.ts`, thin re-export barrel `src/lib/awareness/index.ts`, `src/test/awareness-*.test.ts`.
- Edited: `awareness-drift-sweep/index.ts`, `ambient-pulse/index.ts` (both route through the evaluator — one canonical entry point), `src/hooks/useTodayDigest.ts`, `src/components/today/NoticedRow.tsx`, `src/components/settings/TimeRemindersSection.tsx` (shadow toggle under the existing opt-in).
- No migration: `nudges`, `corrections` and `audit_log` already carry every column needed.
- Tests cover normalization, each relevance factor, urgency ladder including critical resistance, dedupe-key scope isolation, cooldown and escalation-on-change, resolution recheck, bundling, attention budget, and delivery recommendation. Current suite is 190 passing and must not shrink.
