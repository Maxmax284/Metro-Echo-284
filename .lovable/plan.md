# Stage 0 — Audit of what already exists in Vanta

I read the full spec. It explicitly forbids "build first" — audit, then stage. Here's what's already in the codebase, what's partial, and what's truly missing.

## What already exists (reuse — do NOT duplicate)

- **Signal model**: `awareness_briefings.signal jsonb` + `VantaSignal` zod schema with `confidence`, `source_labels`, `freshness`, `requires_confirmation`, `available_routes`. Perfect substrate for corrections.
- **SignalCard**: single renderer; `available_routes` already drives action buttons. Feedback verbs slot in without new UI scaffolding.
- **`useSignalRoute`** hook: central router for verb → action. New verbs (`mark_wrong`, `correct`, `add_field_note`, `source_bad`) plug in here. **One file, one switch.**
- **`audit_log`**: insert-only, no update/delete RLS. Already correct for "annotate-not-rewrite."
- **`awareness_places`** (geo + label): the natural anchor for place-scoped field notes.
- **`nudges.status`**: dismissed/expired already exists.
- **`user_roles`**: owner / admin / user enum + `has_role()` SECURITY DEFINER. Good base.
- **`system_controls`**: per-owner switches for SerpApi, community sources, etc. Privacy toggles can live here.
- **HUD source tiers** (`TIER_META`): official / local / community / web / ai already classified.
- **Sherlock**: `sherlock_findings_cache`, `investigations`, `investigation_findings` — already accept "scope text" payloads and have a confidence column.

## What's partial

- Confidence labels exist but **no mechanism to adjust them from user input**.
- HUD pinning (localStorage) — a weak form of "useful / show again" already.
- `vantaVoice` global rollout (Stage 4 of prior pass) — voices already accept new instructions like "respect saved corrections."

## What's genuinely missing

- **No `corrections` table**. No structured place to land "wrong / outdated / not a commitment."
- **No `field_notes` table**. No place-scoped lived context.
- **No `audit_annotations`** sibling (audit_log is immutable, correctly).
- **No `organization_id` anywhere**. Vanta is single-tenant today. Org intelligence (Stage 6 of spec) would require a real org model — defer.
- **No shared / global intelligence pipeline** (Stage 7). Defer.
- **No privacy / consent settings UI**. `system_controls` is owner-only and admin-y.
- **No "Corrections Center"** review surface.
- **Memory** (`notes`) has no merge / split / forget / pin / sensitive metadata.
- **Telegram-side correction routing**: webhook accepts text but doesn't map "wrong" back to the prior bot message.

## What we will NOT touch this pass

- No org/team model. No shared/global table. No anonymization pipeline.
- No rewriting of `audit_log` (annotations live in a sibling table).
- No changes to `apiGuard`, RLS on existing tables, or the high-risk approval phrase.
- No Telegram correction mapping yet (needs message-id round-tripping; risky given the "messaging feeds, doesn't control" law).

---

# Staged plan (mirrors spec's Stages 1–10, scoped honestly)

This pass = **Stages 1 + 2 only**. Everything else gated behind explicit approval after we feel the shape.

## Stage 1 — Models (next pass)

Two new tables. Both private by default, owner-scoped RLS, no org column yet (additive later).

```text
corrections
  id, user_id, scope ('private'|'org'|'shared_candidate'|'shared_approved'),
  surface, target_type, target_id (uuid or text key),
  feedback_type ('wrong'|'correct'|'outdated'|'not_useful'|'useful'
                |'override'|'reject'|'source_bad'|'risk_adjust'|'style'),
  original_value jsonb, corrected_value jsonb, user_note,
  source_label default 'user_feedback',
  confidence_impact ('lower'|'raise'|'invalidate'|'none'),
  status ('active'|'archived'|'dismissed'|'expired'),
  expires_at nullable,
  created_at, updated_at

field_notes
  id, user_id, place_id nullable, geo jsonb nullable,
  note_type ('place_status'|'hazard'|'transport'|'payments'
            |'connectivity'|'etiquette'|'scam'|'timing'
            |'source_quality'|'custom'),
  summary, details, confidence, freshness,
  sensitive boolean default false,
  share_intent ('private_only'|'ask'|'anonymized_ok'),
  expires_at nullable, seasonal_context jsonb nullable,
  created_at, updated_at

audit_annotations  (sibling — never edits audit_log)
  id, user_id, audit_event_id, note, kind, created_at
```

RLS: `auth.uid() = user_id` on all three, ALL command. No DELETE on `audit_annotations` (immutable like its parent).

## Stage 2 — Surface-level feedback controls (this is the smallest user-visible win)

Extend `SignalRoute` enum + `useSignalRoute` switch with: `mark_wrong`, `mark_useful`, `mark_outdated`, `add_field_note`, `flag_source`, `do_not_show_again`.

Each verb writes one `corrections` (or `field_notes`) row and surfaces a small toast. **No new buttons added anywhere.** They appear automatically wherever a SignalCard renders because `available_routes` already drives the UI. The brief/snapshot edge functions get a small append: include feedback verbs in `available_routes` by default.

Add the same verb set to Sherlock finding cards and Memory note cards via a thin shared `<FeedbackBar />` (one component, reused).

## Stage 3 — Routing (after Stage 2 ships)

- Awareness brief edge fn: on regeneration, query active `corrections` for that place+section and lower confidence / mark conflict in the signal payload.
- Companion (`vanta-converse`) system prompt: prepend "respect active corrections for this user" + inject top N corrections as context.
- Sherlock: when scope mentions a `field_note` or `correction`, treat as evidence, not noise.

## Stage 4 — Corrections Center

New Memory sub-tab: "Field notes & corrections." Lists user's rows, lets them archive, edit, mark expired. Uses existing MemorySurface patterns.

## Stage 5 — Privacy & consent

New `privacy_settings` per-user (private_only default). Adds: share_intent default, "ask before contributing," delete-all button, export JSON. **No sharing actually happens** until Stage 7.

## Stage 6 — Organization intelligence (DEFERRED — needs org model decision)

Requires actual `organizations`, `organization_members` tables and role logic. Out of scope until we agree on org shape. CampCore / Ground Truth Hub each have their own org model — picking one here would lock us in.

## Stage 7 — Shared field intelligence (DEFERRED)

Aggregation pipeline + anonymization + suppression thresholds. Only after Stage 5 is real and Stage 6 settled.

## Stage 8 — Confidence decay & conflict (partially this pass via Stage 2 routing)

Decay rules on `field_notes.expires_at` + a cron edge fn to mark `status='expired'`. Sherlock conflict-referee mode (uses existing investigate flow with new scope hint).

## Stage 9 — UX polish

`<FeedbackBar />` polish, micro-copy, animation. No surveys, no stars.

## Stage 10 — Audit hardening

Verify every correction / field_note insert also writes an `audit_log` row (`event: 'correction:created'` / `'field_note:created'`). RLS audit on the new tables.

---

# What I'll ship if you approve

**This pass = Stages 1 + 2.** Migration for the three tables, extended SignalRoute enum, expanded `useSignalRoute` handler, a small `<FeedbackBar />` used by SignalCard / Sherlock / Memory cards. Nothing org-scoped, nothing shared, nothing creepy. Private by default.

Approve and I'll write the migration first (single file, all three tables + RLS + audit triggers), then the code.
