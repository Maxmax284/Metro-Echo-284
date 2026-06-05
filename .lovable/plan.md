# Vanta Memory Audit & Rearchitecture

Audit done against the live schema (`notes`, `entities`, `entity_links`, `entity_relations`, `note_links`, `commitments`, `ingested_files`, `sherlock_findings`, `messages`) and surfaces (`MemorySurface`, `CapturesView`, `CommandCanvas`, `EntityDetailSheet`, `SherlockSurface`). Doctrine respected: capture never executes, Plan→Approve→Execute, mobile is the battlefield, audit keeps receipts.

---

## 1. Current architecture (what exists today)

**Storage primitives**
- `notes` — flat list, embedding + `autolink_suggestions` cache, no parent.
- `note_links` — pairwise note↔note, single `kind='related'` in practice.
- `entities` — kinds: person/place/org/topic/thing/event. **No `project` kind.** Has embedding, aliases, confidence.
- `entity_links` — polymorphic source→entity (note, message, file, commitment, action…). Good bones.
- `entity_relations` — entity↔entity (works_with, part_of, depends_on…). Underused.
- `commitments`, `ingested_files`, `messages`, `sherlock_findings` — all linkable via `entity_links` but loosely.

**Write path**
- `src/lib/entityGraph.ts` + `supabase/functions/_shared/entityGraph.ts` extract entities with Title-Case regex / @handles / #hashtags / hosts. Rule-based only.
- No semantic-match step. No LLM disambiguation. No alias learning loop.
- Capture surfaces call `linkEntities()` after insert — but extraction misses single-word brand names ("Vanta", "Fenrir", "CampCore") because the rule requires 2+ Title-Case tokens.

**Read path**
- `MemorySurface` (700 lines) — note-first listing.
- `CapturesView` — flat captures.
- `CommandCanvas` / `EntityDetailSheet` — entity-centric but secondary surface.
- `RelatedEntitiesSection` shows "No Strong Links Yet" — relations are rarely populated.
- Sherlock = retrieval/observation per object; no cross-entity synthesis, no duplicate/contradiction surfacing.

## 2. Identified weaknesses

1. **No project tier.** Ground Stay, CampCore, Fenrir are at best `org`/`topic` entities with no first-class container.
2. **Extractor too narrow.** Single-token brands and aliases never link → fragmentation root cause.
3. **Entity model has no project/topic hierarchy.** `entity_relations.part_of` exists but unused on read paths.
4. **Note-first UI.** Every surface lists notes; entity/project views are a side trip, not the home.
5. **`note_links` is redundant with `entity_links`.** Two parallel association systems → drift.
6. **`autolink_suggestions` cached on note** — stale, per-row, never invalidated, not entity-aware.
7. **Sherlock is per-object.** No "what changed about Ground Stay this week" synthesis loop.
8. **No memory health signals.** No orphan/dup/conflict scoring; user can't see fragmentation.
9. **No timeline per entity.** `audit_log` has receipts but isn't projected into a per-entity feed.
10. **Capture routing decides storage but not meaning.** It picks a destination table; it doesn't decide entity/topic/project before write.

## 3. Target model

```text
Capture → Entity (auto) → Topic (auto) → Project (container) → Knowledge view
                                                        ↑
                                              Sherlock synthesis loop
```

- **Project** = first-class entity kind. Container for entities, topics, notes, commitments, files, actions, findings.
- **Topic** = sub-cluster inside a project (Booking System, Payment Flow…). Stored as `entity` with `kind='topic'` and `entity_relations.part_of → project`.
- **Note/commitment/file/message** stays where it is. The graph is the new home; rows are just leaves.

## 4. Database changes (proposed migrations, one per wave)

**Wave A — entity kinds + project container**
- Extend `entities.kind` CHECK to add `'project'`.
- Add `entities.parent_entity_id uuid null references entities(id)` (denormalised cache of `part_of`) + index `(user_id, parent_entity_id)`.
- Add `entities.slug text` unique per `(user_id, kind)` for stable URLs.
- Add `entities.summary text`, `entities.pinned bool default false`.

**Wave B — canonicalisation + aliases**
- New `entity_aliases(entity_id, alias text, source text, confidence text, created_at)` with `unique(user_id, lower(alias))`. Replaces today's `aliases text[]` for lookup; keep array as fallback.
- New `entity_merges(losing_id, winning_id, merged_at, merged_by, reason)` audit table.

**Wave C — knowledge synthesis cache**
- New `entity_timeline_events(entity_id, occurred_at, source_kind, source_id, summary, change_type)` — denormalised stream populated by triggers / edge function from `audit_log` + writes.
- New `entity_health(entity_id, orphan_score, duplicate_of, conflict_count, last_scored_at)`.
- Deprecate `notes.autolink_suggestions` (drop after Wave D ships).

**Wave D — relationship hygiene**
- Backfill `entity_relations.part_of` for existing topic→project guesses (LLM-assisted, status='suggested').
- Add `relation = 'about'` to widen the vocabulary.

All migrations follow the standard GRANT + RLS pattern (auth.uid() = user_id, plus `is_org_member` for workspace scope, matching `notes` policies).

## 5. Extraction & routing engine

Three-layer match cascade for every capture (notes, messages, files, commitments):

1. **Deterministic** — exact + alias + slug match against `entity_aliases` (case-insensitive, word-boundary). Catches "Ground Stay", "GTH", "CampCore", single-word brands. **Fixes the root fragmentation bug.**
2. **Semantic** — embed capture text, cosine search `entities.embedding` for the user, threshold ≥ 0.72 → suggested link (status='pending' on `entity_links`).
3. **LLM disambiguation** — only when (1) and (2) tie or both miss but capture mentions a proper noun. Edge function `entity-resolve` (new) returns `{entity_id|new_entity}` with rationale; writes audit row.

Routing decisions happen **before** the row is committed (capture-route already exists — extend it). Output: `{entity_ids, topic_ids, project_id, confidence, why}`. Low confidence (<0.6) shows the user a one-tap confirm chip; never blocks capture.

## 6. UI changes (mobile-first, 384px)

**New surfaces**
- **Knowledge home** — replaces note-heavy memory landing. Grid of pinned project cards: name, last activity, counts (notes/commitments/actions/files/findings), top themes, last decision. Tap → Project page.
- **Project page** — tabs: Overview · Timeline · Notes · Commitments · Actions · Files · Captures · Findings. Overview = AI summary + recent changes + open questions. Mobile = tab strip, big tap targets.
- **Entity page** (lighter than project) — same shape, no tab strip if only 1-2 sections have content.
- **Memory Health card** — orphans, duplicates, weak links, conflicts. Each row is one-tap fixable.

**Reworked surfaces**
- `MemorySurface` collapses to: pinned projects → recent activity (cross-entity timeline) → unrouted captures. Note list moves behind a "All notes" tab.
- `RelatedEntitiesSection` replaces "No Strong Links Yet" with either real links or a "Why I think this is about X (83%)" suggestion chip.
- `SherlockSurface` gains a "Synthesis" tab: duplicates, contradictions, unresolved threads, project digests.

**Aftermath footer + Vanta Voice** reused everywhere — no new copy system.

## 7. Sherlock evolution

Sherlock today: observe + extract per row. New modes:

- **Relate** — nightly job clusters new captures, proposes entity/project assignments with confidence + rationale.
- **Organize** — detects duplicate notes (cosine ≥ 0.9 + entity overlap), proposes merge.
- **Summarize** — per project, weekly + on-demand: "What changed about Ground Stay this week."
- **Suggest** — contradictions (conflicting decisions about same entity), unresolved discussions (questions in messages with no follow-up commitment/action).

Edge functions to add: `sherlock-synthesize` (per-entity), `sherlock-organize` (dup/conflict scan). Both write findings into the existing `sherlock_findings` table with new `finding_type` values.

## 8. Migration strategy

1. Ship Wave A migration → backfill: every `org`/`topic` entity matching a known project name list (Ground Stay, CampCore, Fenrir, Vanta, Lamai Muay Thai) becomes `kind='project'` and gets a slug. Orphan entities stay as-is.
2. Run `entity-resolve` backfill over last 90 days of notes/messages/files to widen `entity_links`. Idempotent (unique constraint already exists).
3. Run topic clustering pass per project (LLM, batched) → write `entity_relations.part_of` with status='suggested'. User accepts in UI.
4. Ship Knowledge home behind a flag; old MemorySurface stays default until parity confirmed on mobile.
5. Deprecate `note_links` reads (keep table; entity-graph supersedes). Drop `autolink_suggestions` write path.
6. Sherlock synthesis turned on per-project once project has ≥10 linked items.

No data loss at any step; every change is additive until the final cleanup.

## 9. Execution order (recommended)

1. ✅ **Wave 0** — extractor recall pass for single-token brands/acronyms (`recallKnownEntities`).
2. ✅ **Wave A migration** — project kind, slug, parent, summary; Ground Stay backfilled & embedded.
3. ✅ **Entity-resolve edge function** — embedding + RPC `entities_semantic_match` + LLM tiebreak (Gemini Flash) when top-2 within 0.05; persists `entity_links` + audit `entity.resolved`. Wired into note/commitment/reminder capture routes via `resolveEntities()`.
4. **Project page (read-only)** — tabs over existing data (next).
5. **Knowledge home** behind flag.
6. **Wave B + C migrations** — aliases table, timeline events, health scores.
7. **Sherlock synthesize + organize** edge functions; Memory Health surface.
8. **Wave D** — relation backfill, deprecate `note_links` + `autolink_suggestions`.

Each step is independently shippable, mobile-validated at 384px, and emits audit events.

## 10. Doctrine checks

- Capture still never executes — routing produces suggestions; user approves merges/links.
- Plan→Approve→Execute preserved for entity merges, project assignment overrides, duplicate resolution.
- Audit keeps receipts — `entity_merges`, `entity_timeline_events`, and existing `audit_log` cover every state change.
- Mobile-first — every new surface specified at 384px first.
- Plain English on top, structured underneath — Vanta Voice handles all new copy; raw event codes stay in Audit.

---

**Ask before I build:** confirm execution order above (esp. starting with the extractor fix in Wave 0 for immediate relief), or tell me to reorder. Also: should "project" be a new `entities.kind` (lean, recommended) or a separate `projects` table (heavier, more isolation)?
