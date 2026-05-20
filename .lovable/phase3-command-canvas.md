# Phase 3 — Command Canvas + Sherlock 2 (Architecture Roadmap)

Status: **Doc only. No code.** Build order, contracts, and guardrails for the next
big interactive/recognition layer. Nothing here ships until the relationship/object
model below is real in the database.

---

## 0. Why this is doc-first

Command Canvas and Sherlock 2 both depend on a shared substrate:
a typed **object graph** (entities + relationships + provenance) that today
only exists implicitly across `notes`, `commitments`, `field_notes`,
`messages`, `signals`, and `research_runs`.

If we build Canvas before the graph, Canvas becomes a pretty wrapper around
unjoinable rows. If we build Sherlock 2 before the graph, it becomes a second
search box. Both fail the doctrine: *every captured item must have an aftermath*.

So Phase 3 sequencing is non-negotiable:

```text
3a. Object/relationship model   (DB + RLS + audit)
3b. Recognition layer           (Sherlock 2 reads the graph)
3c. Command Canvas              (interactive surface over the graph)
```

Each step ships and is validated on mobile 384px before the next starts.

---

## 1. Phase 3a — Object / Relationship Model

### Goal
One queryable graph that every existing surface already writes into,
without rewriting them.

### New tables (proposed — not yet created)

- `entities`
  - `id uuid pk`
  - `user_id uuid`
  - `kind text` — `person | place | org | topic | thing | event`
  - `display_name text`
  - `aliases text[]`
  - `confidence text` — `low|medium|high`
  - `first_seen_at`, `last_seen_at`
  - `embedding vector(1536)` (optional, for dedupe)
  - RLS: owner-only.

- `entity_links`
  - `id uuid pk`
  - `user_id uuid`
  - `source_kind text` — `note | commitment | message | signal | field_note | research_run | file | reminder`
  - `source_id uuid`
  - `entity_id uuid fk entities`
  - `role text` — `mentions | about | owner | location | participant | source`
  - `confidence text`
  - `created_at`
  - unique(`source_kind`,`source_id`,`entity_id`,`role`)
  - RLS: owner-only.

- `entity_relations`
  - `id uuid pk`
  - `user_id uuid`
  - `from_entity_id`, `to_entity_id`
  - `relation text` — `works_with | located_at | part_of | knows | rival_of | depends_on`
  - `evidence_count int`
  - `last_evidence_at`
  - RLS: owner-only.

### Backfill / write path
- **No new write surfaces.** Existing capture paths
  (`notes`, `commitments`, `messages`, `field_notes`, `signals`,
  `email-inbound`, `telegram-webhook`) get a single shared helper
  `linkEntities(source_kind, source_id, text)` that:
  1. Extracts candidate entities (rule-based first, model-assisted later).
  2. Resolves to existing `entities` rows by alias + embedding cosine.
  3. Upserts `entity_links` rows.
- Helper lives in `supabase/functions/_shared/entityGraph.ts`.
- Every link emits an `audit_log` event (`entity.linked`).

### Acceptance bar for 3a
- Opening any note/commitment/message shows the entities it mentions.
- Tapping an entity shows every source that referenced it, ordered by recency.
- Zero new top-level UI surfaces. The graph lives **inside existing detail
  views first**. Canvas comes later.

---

## 2. Phase 3b — Sherlock 2 (Recognition Layer)

### Goal
Sherlock stops being "ask a question, get a synthesis."
It becomes "watch the graph, surface things that matter."

### Three Sherlock modes (only one new — `watch`)

| Mode      | Trigger                  | Output                             | Status        |
|-----------|--------------------------|-------------------------------------|---------------|
| `ask`     | User question            | Investigation w/ sources            | exists today  |
| `pin`     | User pins entity/topic   | Sherlock re-checks on schedule      | exists today  |
| `watch`   | Graph signal threshold   | Drafts a finding card, **never auto-acts** | NEW |

### `watch` triggers (all derived from graph, not new ingestion)
- An entity appears in 3+ sources within 7 days with no commitment yet
  → draft: "You've mentioned X a lot — want to track something?"
- A commitment's referenced entity has zero updates in N days
  → draft: "X has gone quiet on \"<commitment>\". Nudge?"
- Two entities co-occur for the first time across distinct sources
  → draft: "First time I've seen X and Y in the same context."

### Architecture rules
- Watch runs as a scheduled edge function (`sherlock-watch`), once per hour.
- Findings are written to existing `sherlock_findings` table with
  `origin = 'watch'`. **No new tables for Sherlock 2.**
- Every finding lands in the Attention Queue as a card, not a notification.
- Card answers the four doctrine questions:
  *what is this / what happened / what can I do / what happens if I tap*.
- Voice: uses `SHERLOCK_VOICE` (already shared).

### Acceptance bar for 3b
- No new push notifications. Quiet by default.
- Every watch finding is dismissible and the dismissal is audited.
- A user with no graph activity sees zero watch output (no fake signals).

---

## 3. Phase 3c — Command Canvas

### Goal
A single interactive surface where the user can **see** the graph and
**stage** actions across it. Still Plan → Approve → Execute. Still single-surface.

### What Canvas is NOT
- Not a chat UI.
- Not a new home screen.
- Not a Notion/Obsidian clone.
- Not a place where AI fires actions on its own.

### What Canvas IS
- A zoomable map of recently-active entities and the sources around them.
- Tap an entity → side sheet of its sources + open commitments + suggested next steps.
- Drag two entities together → drafts an `entity_relation` for review.
- Long-press on a source → routes (note / commitment / reminder / Sherlock) — same routes that exist today.

### Build constraints
- Must work at **384px** first. Pinch-zoom on mobile, not desktop-only.
- Tap targets ≥ 44px.
- Reuses existing card components (no parallel UI library).
- Renders from cached graph snapshot; no live queries on pan/zoom.
- Empty state is plain text from `vantaSay.empty` (already shared).

### Acceptance bar for 3c
- Removing Canvas removes zero functionality from any other surface.
- Every Canvas action emits the same audit events as the equivalent
  long-press route elsewhere. No new event types.
- Voice strings come from shared `vantaSay` / `VANTA_CORE_VOICE`. No new copy file.

---

## 4. Out of scope for Phase 3
- WhatsApp bridge. (Sequenced after Telegram is proven on Vanta + GTH.)
- Multi-user / shared graphs. Single-owner only.
- Any automatic execution. Plan → Approve → Execute is law.
- A second Sherlock surface. Sherlock 2 lives inside the existing Sherlock UI.
- A second Memory surface. Entities surface inside Memory detail views first.

---

## 5. Sequencing rule

Do **not** open 3b until 3a's acceptance bar is green on the 384px viewport.
Do **not** open 3c until 3b has produced at least one real, useful `watch` finding
from real captured data — not a seeded demo.

If at any point a step starts requiring new top-level surfaces, new write paths,
or new notification channels, **stop and revisit this doc** before writing code.
