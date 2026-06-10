# Companion Intelligence + Operator Profile — Audit & Design (Phase 1)

> Status: **Design only.** No code, no migrations, no new tables, no new AI calls.
> Goal: define the future Companion Intelligence layer without building it prematurely.

---

## Spine (non-negotiable)

- Memory stores facts.
- Patterns observe behavior.
- Operator Profile explains how the person works.
- Companion Intelligence uses that understanding to reduce friction.
- Capture never executes. Plan → Approve → Execute stays the spine.
- No silent profile building. No invisible behavior changes. No autonomous action.
- Anything that becomes a stable trait must be user-approved.
- The user must be able to edit, delete, export, or purge what Vanta thinks it knows.
- Quiet inferences may help ranking and session hints, but they must not become permanent profile traits.
- Receipts must explain why any future trait was suggested.

---

## 1. Signal Inventory — what Vanta already has

Every source below already exists. Companion Intelligence is mostly an **aggregation layer**, not a new engine.

| Domain | Source (table / file) | Verdict |
|---|---|---|
| Captures | `messages`, `field_notes`, `notes`, `ingested_files` | Already sufficient |
| Routing | `capture_routes`, `user_channel_links` | Already sufficient |
| Projects | `projects`, `project_items`, `project_suggestion_dismissals` | Already sufficient |
| Briefs / Exports | `brief_exports`, edge fns `compose-brief`, `briefing-compose` | Already sufficient |
| Attention lifecycle | `intake_dismissals`, `src/lib/intakeLifecycle.ts`, `useIntakePrefs` | Already sufficient |
| Receipts | `audit_log`, `audit_annotations` | Already sufficient |
| Inference / hints | `sherlock_findings(_cache)`, `cross_links`, `entity_links`, `entity_relations` | Already sufficient |
| Preferences | `profiles.preferences`, `useUserPreferences`, `sherlock_settings`, `system_controls` | Needs aggregation only |
| Channels | Telegram (`telegram_*`), `email_inbound_addresses`, share-target, `push_subscriptions` | Already sufficient |
| Investigations | `investigations`, `investigation_findings`, `research_objects` | Already sufficient |
| Corrections | `corrections` | Already sufficient — single richest "what the user actually meant" signal |

**Net new signals required for Phase 2:** zero. The Operator Profile read-only view can be assembled entirely from existing rows.

---

## 2. What Companion Intelligence may infer **quietly** (no approval)

Quiet inferences are ephemeral. They may bias the *current* session but must not write a profile row and must not survive logout.

Permitted quiet behavior:

- Re-rank suggestions in Inbox using recent attach history.
- Pre-select the most likely project in *attach to project* sheets.
- Show a "you might mean…" hint chip on a single capture.
- Bias Sherlock cache TTL based on recent dismiss vs. accept rate.
- Pick a default brief tone when the user opens the composer, but never auto-send.

Hard rules for quiet inference:

- Must not write to any `operator_profile_*` table.
- Must not persist beyond the auth session.
- Must be explainable on hover: "based on your last N actions in this session."
- Must be overridable in one tap.

---

## 3. What requires **explicit approval** before becoming a stable trait

Anything that survives logout, biases other surfaces, or shapes future suggestions is a stable trait and requires approval.

Stable-trait categories:

- **Routing preferences** — "Ground Stay payment notes → Booking & Payments."
- **Output preferences** — preferred brief tone, audience, format, length.
- **Recurring project bindings** — "captures from Telegram chat X usually belong to project Y."
- **Dismissal patterns** — "personal-tagged captures: hide after 3 days."
- **Workflow shortcuts** — "after summarizing, you usually export as Operator Brief."

**Approval surface (spec, not built):**

A small chip rendered inline next to the relevant card. Three actions, no more:

- **Remember** — promotes the suggested trait to `approved`.
- **Not now** — keeps it as `suggested`, cooldown 7 days.
- **Never suggest this again** — promotes to `rejected`, cooldown infinite (restorable from Settings).

Every chip must carry a receipt link → opens a drawer with: *what / why / source pattern / when suggested / source events*.

---

## 4. Operator Profile — schema design (NOT migrated yet)

Two future tables. Names and columns documented here so the eventual migration is straightforward and reviewable.

### `operator_profile_traits`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid → auth.users | RLS scoped to owner |
| `kind` | text | one of: `working_style`, `workflow`, `output_pref`, `common_project`, `friction_point`, `routing_pref` |
| `value_json` | jsonb | structured value, e.g. `{"channel":"telegram","chat_id":"…","project_id":"…"}` |
| `status` | text | `suggested` \| `approved` \| `rejected` \| `retired` |
| `source_pattern` | text | plain-English explanation: "attached 4/5 Ground Stay payment captures to Booking & Payments in last 14 days" |
| `source_event_ids` | uuid[] | pointers into `audit_log` so receipts always resolve |
| `suggested_at` | timestamptz | |
| `approved_at` | timestamptz | null until approved |
| `retired_at` | timestamptz | for soft delete |
| `last_used_at` | timestamptz | bumped when a trait influences a suggestion |

### `operator_profile_suggestions_log`

| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `user_id` | uuid | |
| `trait_kind` | text | mirrors `kind` above |
| `proposed_value` | jsonb | |
| `outcome` | text | `shown` \| `approved` \| `dismissed` \| `never_again` |
| `cooldown_until` | timestamptz | enforces "Not now" / "Never again" |
| `surface` | text | where the suggestion appeared |
| `created_at` | timestamptz | |

**Field taxonomy** (matches the brief verbatim):

- Working Style
- Common Workflows
- Preferred Outputs
- Common Projects
- Friction Points
- Routing Preferences

---

## 5. Settings surface — "What Vanta knows about you"

New section in `src/pages/Settings.tsx` (Phase 2 build, not now). Spec:

- **Approved traits** — list view, each row: plain-English trait + *Edit* + *Delete*.
- **Suggested traits awaiting approval** — same chip pattern as §3.
- **Rejected / Never-again** — collapsed by default, restorable.
- **Master switch** — pause Companion Intelligence entirely. When off, no traits influence any surface.
- **Per-category switches** — routing / output / projects / friction. Independent.
- **Export** — "Download what Vanta knows about me" → JSON + PDF mirror.
- **Purge** — single button, double-confirm, deletes all traits + suggestions log.

---

## 6. Privacy + trust controls

Every approved trait must answer five questions on demand, in plain English:

1. What is remembered?
2. Why was it suggested?
3. What source pattern caused it?
4. When did I approve it?
5. How do I delete it?

Enforcement (design):

- RLS: `user_id = auth.uid()` for all reads/writes.
- A `assert_approved()` SQL guard on any read used by suggestion surfaces — surfaces never read `suggested` rows as if they were approved.
- All trait state changes emit `audit_log` events (`operator_profile.suggested|approved|rejected|deleted|retired`).
- Export and purge are first-class, not afterthoughts.

**Hard "no" list (from the brief, restated as product law):**

- No personality / horoscope summaries.
- No productivity scores. No optimization scores. No social scoring.
- No silent automation. No silent device scanning. No hidden profile building.
- No irreversible memory. No aggressive notifications.
- No language like "I know you better than you know yourself," "tracking," "behavioral surveillance."

**Preferred language:** "Vanta noticed…", "Want me to remember this?", "This looks similar to how you handled…", "This may belong to…", "You can change this anytime."

---

## 7. Device presence — future, not now

Vanta is a capture target. Devices feed it. Devices never control it.

Candidate device inputs (documented, not implemented):

- Mobile share sheet
- Screenshot share
- Voice note
- Quick capture widget
- Lock-screen capture
- Desktop file drop
- Telegram (live)
- Email inbound (live)
- WhatsApp (future, after Telegram is proven on Vanta → GTH → CampCore)
- Calendar — read-only signals only
- Location / weather — only with explicit consent
- Wearables — only if there is a clear operational reason

Rules (non-negotiable):

- Devices feed Vanta. Devices do not control Vanta.
- No silent phone crawling. No hidden background surveillance.
- The user chooses sources. The user can disable any source.
- Sensitive sources require an explicit consent gate, not a buried toggle.

---

## 8. How this plugs into the existing simplified flow

| Surface | What approved traits change | Source |
|---|---|---|
| **Inbox** | Routing suggestions ranked by routing traits | `capture_routes` + `routing_pref` traits |
| **Projects** | Attach suggestions ranked by common-project traits | `project_items` history + `common_project` traits |
| **Living Brief** | Default tone matches output preferences | `output_pref` traits |
| **OpenCanvas** | Grouping hints from co-attach patterns | `project_items` adjacency |
| **Briefs** | Default audience + format pre-selected | `output_pref` traits |
| **Receipts** | Every suggestion links to source events in `audit_log` | `audit_log` |

Nothing on this list changes a row without an explicit user action. Suggestion = pre-fill, never auto-commit.

---

## 9. Out of scope until UI/UX cleanup ships

The following will **not** be built until intake cleanup (Slice 6) is validated in the wild and Telegram is proven end-to-end:

- New engines, new background jobs, new AI calls, new tables.
- Suggestion chips embedded in Inbox / Projects.
- Auto-generated Operator Profile traits (even from existing signals).
- Any device expansion beyond what already exists.
- Any cross-platform sync of traits (Vanta ↔ GTH ↔ CampCore).
- Any AI-written "summary of you" copy. The profile is structured fields, not prose.

If a feature is not on the Phase 2–6 list below, it is out of scope.

---

## 10. Phased rollout

**Phase 1 — Design only (this document).**
Ships now. No code.

**Phase 2 — Read-only Operator Profile.**
Render existing approved preferences (`useUserPreferences`, `intake` prefs, `sherlock_settings`, routing defaults) as a single profile view. No inference. No new writes. Pure read.

**Phase 3 — Suggested traits with approval chips.**
Introduce `operator_profile_traits` + `operator_profile_suggestions_log`. One category at a time, starting with **routing preferences** (smallest blast radius, highest daily payoff). Chip surface uses §3 spec exactly.

**Phase 4 — Routing traits feed project suggestions.**
Approved routing traits bias the *attach to project* sheet and Inbox ranking. Quiet biasing, never auto-attach.

**Phase 5 — Output traits feed brief defaults.**
Approved `output_pref` traits pre-fill brief composer tone, audience, format. User can override every time.

**Phase 6 — Device-aware capture expansion.**
Only after the core flow is calm. Adds share-target enhancements, quick capture widget, lock-screen capture, and the device-presence consent gates from §7.

---

## Acceptance check (against the brief)

- **How can Vanta learn without being creepy?** Quiet inference is ephemeral; stable traits require explicit approval; receipts always explain why.
- **What can Vanta safely notice?** §2 — session ranking, pre-fills, single-card hints.
- **What must require approval?** §3 — anything that persists or biases other surfaces.
- **How does the user edit/delete what Vanta remembers?** §5 — per-row edit/delete, per-category switches, master pause, export, purge.
- **How does this reduce friction?** Pre-fills the right project, pre-picks brief tone, hides what the user keeps hiding, surfaces what the user keeps attaching.
- **How does it support Projects / Living Briefs / Canvas / Exports / Receipts?** §8.
- **What should not be built yet?** §9 — everything except the Phase 1 doc itself.

---

## Final principle

Vanta should understand the operator over time, but never trap the operator inside invisible automation.

The user owns the system. Vanta observes patterns, asks before remembering, explains its reasoning, and keeps receipts.

The goal is not more complexity. The goal is less friction.
