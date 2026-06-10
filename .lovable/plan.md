# Plan — Companion Intelligence + Operator Profile (Phase 1: Design Only)

The uploaded brief is explicit: **do not build yet**. Phase 1 deliverable is an audit/design document, full stop. So this plan produces *one artifact* — a written design doc — and stops there. No new tables, hooks, components, or migrations.

## What I'll deliver

A single markdown file at `.lovable/companion-intelligence-audit.md` (mirrors the existing `.lovable/architecture-audit.md` pattern), plus a downloadable PDF mirror at `/mnt/documents/vanta-companion-intelligence-audit.pdf` so you can hand it around.

Both contain the same 10 sections the brief asks for, mapped to what actually exists in the codebase today.

## Document outline

1. **Signal inventory** — every existing source that can feed Companion Intelligence, with the table/file it lives in:
  - Captures: `messages`, `field_notes`, `notes`, `ingested_files`
  - Routing: `capture_routes`, `user_channel_links`
  - Projects: `projects`, `project_items`, `project_suggestion_dismissals`
  - Briefs/Exports: `brief_exports`, `compose-brief`, `briefing-compose`
  - Attention lifecycle: `intake_dismissals`, `intakeLifecycle.ts`, `useIntakePrefs`
  - Receipts: `audit_log`, `audit_annotations`
  - Inference: `sherlock_findings(_cache)`, `cross_links`, `entity_links`
  - Prefs: `profiles.preferences`, `useUserPreferences`, `sherlock_settings`, `system_controls`
  - Channels: Telegram, email-inbound, share-target, push  
   Verdict per source: **already sufficient**, **needs aggregation only**, or **requires new signal** (kept to a minimum).
2. **What can be inferred quietly** (no approval needed, never becomes a stable trait):
  - Per-session UI state, ephemeral nudges, ranking re-orders, "you might mean…" hints.
  - Rule: quiet inferences must not write to a profile table and must not survive logout.
3. **What requires explicit user approval** before becoming a stable trait:
  - Routing preferences, output-style preferences, recurring-project bindings, dismissal patterns, default brief audience/format.
  - Approval surface spec: chip with **Remember / Not now / Never suggest this again**, plus the receipt fields the brief requires (what, why, source pattern, when approved, delete control).
4. **Operator Profile schema (design only, not migrated yet):**
  - `operator_profile_traits` — `user_id, kind, value_json, status (suggested|approved|rejected|retired), source_pattern, source_event_ids[], suggested_at, approved_at, retired_at`.
  - `operator_profile_suggestions_log` — every suggestion shown, accepted/dismissed, with TTL so "Never suggest again" is enforceable.
  - Field taxonomy: Working Style, Common Workflows, Preferred Outputs, Common Projects, Friction Points, Routing Preferences (matches the brief verbatim).
5. **Settings surface** — new "What Vanta knows about you" section in `Settings.tsx`:
  - Approved traits (editable / deletable)
  - Suggested traits awaiting approval
  - Rejected / "never suggest" list (restorable)
  - Master switch: pause Companion Intelligence entirely
  - Per-category switches (routing / output / projects / friction)
6. **Privacy + trust controls:**
  - Every trait answers: *what / why / source / when approved / how to delete*.
  - No silent writes — enforced by RLS + an `assert_approved()` check in the design.
  - Export ("Download what Vanta knows about me") and full purge.
  - Hard "no" list quoted from the brief: no scoring, no horoscopes, no surveillance language, no autonomous action.
7. **Device presence — future, not now:**
  - Document the capture-only stance, list candidate inputs (share sheet, voice, screenshot, lock-screen, desktop drop, calendar read-only, location-on-consent).
  - Restate the law: devices feed, never control. Sensitive sources require explicit consent gates.
8. **How it connects to the existing simplified flow:**
  - Inbox → routing suggestions from approved routing traits
  - Projects → attach suggestions from `project_items` + routing history
  - Living Brief → tone defaults from output preferences
  - Canvas → grouping hints from co-attach patterns
  - Briefs → format/audience defaults
  - Receipts → every suggestion links back to source events in `audit_log`
9. **Out of scope until UI/UX cleanup ships:**
  - Any new engine, any new background job, any new AI call, any new table.
  - No suggestion chips in Inbox/Projects until intake cleanup (Slice 6) is fully validated in the wild.
  - No device expansion until Telegram bridge is proven on Vanta → GTH → CampCore.
10. **Phased rollout (matches the brief):**
  - **Phase 1 (this doc):** design only. Ships now.
    - **Phase 2:** read-only Operator Profile generated from *already-approved* preferences (`useUserPreferences`, `intake` prefs, `sherlock_settings`). No new inference.
    - **Phase 3:** suggested traits with approval chips. One suggestion category at a time, starting with routing.
    - **Phase 4:** approved routing traits feed project suggestions.
    - **Phase 5:** approved output traits feed brief defaults.
    - **Phase 6:** device-aware capture expansion — only after core flow is calm.

## Acceptance check (against the brief)

The doc must answer, in plain English:

- How Vanta learns without being creepy
- What it may notice silently vs. what needs approval
- How the user edits/deletes anything remembered
- How this reduces daily friction
- How it plugs into Projects / Living Briefs / Canvas / Exports / Receipts
- What is explicitly **not** being built yet

## Files touched

- **Create:** `.lovable/companion-intelligence-audit.md`
- **Create (artifact):** `/mnt/documents/vanta-companion-intelligence-audit.pdf`
- **No code changes. No migrations. No new hooks/components.**

Approve and I'll write the doc + generate the PDF in one pass.

&nbsp;

Approved.

&nbsp;

Proceed with Phase 1 exactly as planned.

&nbsp;

Deliver only:

&nbsp;

1. .lovable/companion-intelligence-audit.md

2. /mnt/documents/vanta-companion-intelligence-audit.pdf

&nbsp;

No code changes.

No migrations.

No new hooks.

No new components.

No new tables.

No new AI calls.

No new background jobs.

No suggestion chips yet.

No device expansion yet.

&nbsp;

This phase is documentation only.

&nbsp;

The audit should clearly define how Companion Intelligence and the Operator Profile will eventually work without making Vanta creepy, noisy, or autonomous.

&nbsp;

The most important rules:

&nbsp;

- No silent profile building.

- No invisible behavior changes.

- No autonomous action.

- Capture never executes.

- Plan → Approve → Execute stays the spine.

- Anything that becomes a stable trait must be user-approved.

- The user must be able to edit, delete, export, or purge what Vanta thinks it knows.

- Quiet inferences can help ranking/session hints, but they must not become permanent profile traits.

- Receipts must explain why any future trait was suggested.

&nbsp;

Keep the language plain English.

&nbsp;

The goal of this document is to define the future Companion Intelligence layer without building it prematurely.

&nbsp;

Proceed with the audit doc and PDF mirror in one pass.