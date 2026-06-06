## Audit — what already exists

**Surface**: `src/components/surfaces/CommandCenterSurface.tsx` is already mounted. It composes:
- `ProductivityPulseCard`, `AwareCockpitCard`, `OperationsBriefingPanel` (the live brief), `LiveCaptureCard`, `ApprovalsCard`, `TodayCard`, `FilesTile`, `SherlockWatchtowerCard`, `MemoryPulseCard`, `SystemReceiptsCard`, `ResearchPanel`.

**Briefing engine**: `briefing-compose` edge fn already returns verdict / what_changed / what_matters / useful_connections / source_grounding / sections, gated by role and workspace scope, with `signals_hash` caching. This is the right base to reuse.

**Data we can roll up without new tables**:
- `notes`, `commitments`, `actions`, `ingested_files`, `messages`, `captures` (via messages+files), `cross_links` (+ `cross_links_for_item` RPC), `entities` (with `parent_entity_id`, `slug`, `pinned`, `summary`), `entity_links`, `entity_relations`, `sherlock_findings`/`_cache`, `audit_log`, `external_platform_webhook_events`.

**What's missing for the rollup goal**:
1. No **per-project rollup** view — Operations Briefing is global, not project-scoped.
2. No **brief export** pipeline (PDF, audit packet, weekly review, audio script).
3. No **storage of generated briefs**.
4. No **brief.* audit events** beyond `briefing.viewed/refreshed/dismissed`.
5. `LiveCaptureCard` is duplicated in the dashboard wrapper — fine, leave it.

Reusing existing infrastructure means no new rollup table is strictly required; we'll add one small `brief_exports` table for persistence, and one materialized helper RPC for project rollup. No invisible AI graph behavior is introduced — every AI call stays user-initiated.

---

## Plan

### Wave 1 — Project / Entity rollup layer

**New RPC** `entity_rollup(_entity_id uuid)` (SECURITY DEFINER, scoped to `auth.uid()`):
returns one row per entity with:
- entity meta (`id, display_name, kind, slug, summary, parent_entity_id, pinned`)
- counts: linked notes, commitments (open/overdue), actions (staged/proposed/executed-7d), files, messages, sherlock pending, cross_links, audit events (7d)
- last 5 audit events
- last 3 changes (most recent linked item)
- "suggested next move" derived from highest-priority open child (overdue commitment → high-risk action → unresolved Sherlock)

Pulls via `cross_links` (entity ↔ *) + `entity_links` + `entity_relations`.

**New component** `src/components/cockpit/ProjectRollupCards.tsx`:
- Query: entities where `kind='project'` OR `pinned=true`, scope-aware
- Renders mobile-first stacked cards at 384px (one column, tap → opens `EntityDetailSheet`)
- Each card mirrors the user's example: Recent change · Needs attention · Linked items · Receipts · Suggested next move
- "Create Brief" button per card → opens `BriefComposerSheet`

Insert above `OperationsBriefingPanel` (the global brief stays as the top-of-system summary; project cards sit directly under it).

### Wave 2 — Brief composition & export pipeline

**New edge function** `compose-brief`:
- Input: `{ scope: 'system' | { entity_id }, format: 'operator'|'client'|'audit_packet'|'weekly_review'|'audio_script', range_days, role, organization_id? }`
- Reuses the same source-gating logic as `briefing-compose` (call shared helpers, or duplicate the role/scope guards)
- Pulls the rolled-up source set, then one Lovable AI pass produces:
  ```
  { title, subtitle, sections: [{ id, heading, kind: 'prose'|'list'|'timeline'|'decision'|'receipts'|'pull_quote', body }], appendix_receipts: [...], grounding: {...}, signals_hash }
  ```
- Format presets adjust prompt + section ordering. `audit_packet` returns receipts-first, minimal prose. `audio_script` returns a single spoken-prose section, no headings.
- Emits `audit_log` event `brief.generated` with `payload.format, payload.scope, payload.signals_hash`.

**New table** `public.brief_exports`:
```
id uuid pk, user_id uuid, organization_id uuid null, entity_id uuid null,
format text, title text, brief jsonb, storage_path text null,
status text default 'draft',         -- draft | approved | exported
approved_at timestamptz, exported_at timestamptz,
created_at, updated_at
```
RLS: owner-only via `auth.uid() = user_id`; workspace briefs additionally require `is_org_member`. GRANTs per project conventions.

**Storage**: reuse existing private `memory-uploads` bucket under prefix `briefs/{user_id}/{export_id}.pdf`. Storage RLS on `objects` for that prefix scoped to owner.

### Wave 3 — Brief Composer UI

**New components** under `src/components/briefs/`:
- `BriefComposerSheet.tsx` — bottom sheet (mobile-first):
  1. **Choose format** (Operator / Client / Audit Packet / Weekly Review / Audio Script)
  2. **Choose scope** (current entity, "Whole system", or pinned-project picker)
  3. **Tap Draft** → calls `compose-brief`, shows live structured preview
  4. **Review** — sections rendered with the layout vocabulary below
  5. **Approve & Export** → render PDF client-side (`@react-pdf/renderer`), upload to `memory-uploads`, write `brief_exports` row with `status='exported'`, audit `brief.exported` / `pdf.generated` / `audit_packet.generated`
  6. **Play audio** (audio_script format only) — `window.speechSynthesis` with play/pause/stop; emits `audio_brief.generated` on first play

- `BriefRenderer.tsx` — renders section kinds: prose, list, timeline-blocks, decision-boxes, pull-quotes, receipts table. Calm, minimal, premium type; no emojis.

- `BriefPdfDocument.tsx` — `@react-pdf/renderer` document with: Title page → Overview → Recent changes → Decisions → Commitments → Actions → Linked files → Sherlock findings → Timeline → Audit receipts → Suggested next moves → Receipt appendix. Single accent color from existing token; serif heading + sans body.

- `BriefExportsList.tsx` — list of past exports for an entity / system, with re-download links pulling signed URLs from the bucket.

### Wave 4 — Wiring

- `CommandCenterSurface.tsx`: insert `<ProjectRollupCards />` between `OperationsBriefingPanel` and `LiveCaptureCard`. Add a header-level "Create Brief" button (system scope) next to "Open Canvas".
- `EntityDetailSheet.tsx`: add "Create Brief" button in the project banner; add "Briefs" tab listing `brief_exports` for that entity.
- `OperationsBriefingPanel`: add a small "Export this brief" link → opens `BriefComposerSheet` pre-filled with current global verdict as a draft seed.
- New deps: `@react-pdf/renderer` only. No new AI provider.

### Wave 5 — Doctrine guards (build-time enforcements)

- All briefs render `status='draft'` first; export button is the only path that writes a file and the only path that emits `*.exported`.
- No background brief generation; every compose is a user tap.
- Every PDF section that cites a fact includes the `kind:id` in its grounding, which appears in the receipt appendix — claims always trace back.
- All `brief_exports` rows and storage objects carry `user_id` / `organization_id`, scope-gated via existing helpers.
- Audit events: `brief.generated`, `brief.exported`, `pdf.generated`, `audio_brief.generated`, `audit_packet.generated`.

### Mobile-first notes (384px target)

- Project rollup cards: single column, 12px gutters, 13px body, 11px metadata, 44px tap targets on "Create Brief" and "Open".
- BriefComposerSheet: full-screen sheet on <640px; sticky footer with "Draft / Approve & Export"; section preview collapsible.
- PDF is desktop-formatted (Letter), but the in-app preview is mobile-readable (max-w-prose, no horizontal scroll).

### Out of scope (deferred, called out so we don't forget)

- True InDesign export (IDML). The structured `brief` JSON is layout-aware enough to feed a future IDML generator.
- High-quality TTS via gateway — v1 ships browser SpeechSynthesis only.
- Cross-entity automatic rollups (e.g. portfolio of projects). Reachable once per-project rollup is proven.

### Build order

1. `entity_rollup` RPC + `brief_exports` table + storage RLS (one migration).
2. `ProjectRollupCards` + wire into Command Center.
3. `compose-brief` edge function with the 5 format presets.
4. `BriefComposerSheet` + `BriefRenderer` + audio playback.
5. `BriefPdfDocument` + storage upload + `brief_exports` write + audit events.
6. `BriefExportsList` in `EntityDetailSheet` + system-scope entry on Command Center.
