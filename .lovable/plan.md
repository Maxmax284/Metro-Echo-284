# Vanta Capture + Intake Maturity Pass — Plan

## Part 1 — Audit findings (current wiring)

What I found by reading the existing surfaces (no code changed):

**Where captures actually land today**
- Telegram messages → `messages` table via `telegram-webhook` edge fn. Visible only as raw chat lines in `ConversationSurface` (the "Log" tab). No source chip, no detected-type, no route, no confidence.
- Companion / chat input → same `messages` table. Inline receipt cards exist for `stage_action`, `add_commitment`, `capture_note` (good), but only inside the active thread — they disappear from view once you leave.
- File / screenshot uploads → `ingested_files` → `files-ingest` edge fn → optionally creates a `notes` row. Status chip exists *only* inside `FileUploadCard` on the Memory surface. No global pipeline view, no document-type classification surfaced, no route history.
- Notes → created directly in `MemorySurface`, or by file ingest, or by Companion `capture_note`. No `type`, no source linkage shown, no "convert to reminder/commitment" affordance.
- Reminders vs Commitments → both live in `commitments` table; no visible distinction in UI.
- Corrections → `corrections` table, surfaced only inside `CorrectionsCenter` tab in Memory.
- Field notes → `field_notes` table, only touched by Awareness flows. Invisible elsewhere.
- Sherlock routes → `investigations` + `sherlock_findings_cache`. Visible on its own surface but not as a capture-route history.
- Action drafts → `actions` surface. Not linked back to the capture that spawned them.
- Audit → `audit_log` is well-populated for actions and approvals, **but** there are no events for: telegram capture received, file classified, ambiguous item created/resolved, capture routed.

**Visibility gaps (the "front desk" problem)**
- No single place lists "what came in" across channels. `CommandCenterSurface` has a `LiveCaptureCard` but it only merges last 5 user messages + 5 files, no status/route/confidence.
- No Ambiguous Queue exists. Anything Vanta can't classify silently becomes a plain note or message.
- "Log" tab label is misleading — it looks like chat, smells like chat, but the platform law is capture-only. No banner says so.
- File pipeline states exist in DB (`pending|done|failed|error`) but the card only shows raw status, no human copy, no document-type, no route options.
- Memory is a flat list of notes + search. No grouping by people/projects/places/source/status.
- Mobile: `FileUploadCard` and `LiveCaptureCard` cards are dense; chip rows wrap awkwardly at 390px.

**Voice gaps**
- File status reads as raw enums ("pending", "failed"). Needs Vanta voice.
- Telegram bot replies are mostly fine but don't expose detected-type back to the user.

## Part 2 — What I'll build in this pass (Stage 1 + Stage 2 only)

Per the brief, do not implement all stages at once. This pass ships the visible front desk + the two most-used capture channels. Stages 3–9 are scoped but staged.

### Stage 1 — Captures lane + Ambiguous Queue (inside Memory)

Mature the existing Memory surface with a new top-level view toggle:
`Notes | Captures | Ambiguous | Corrections`

**Captures view** — unified feed pulling from `messages` (role=user), `ingested_files`, `field_notes`, recent `commitments`/`notes` created via capture, and `audit_log` entries tagged `capture.*`. Each row is a `CaptureCard`:

```
[source-icon] "Quick line of what came in…"
Source: Telegram · Detected as: Possible commitment · Confidence: Medium
Linked: Nikki · GroundStay         Status: Needs review
[Confirm commitment] [Save as note] [Send to Sherlock] [Correct label] [Ignore]
```

Filters (chip row): All · Telegram · Companion · Files · Notes · Field notes · Needs review · Last 24h.

**Ambiguous view** — same card shape but only items where detected_type is null/low-confidence, or where `metadata.needs_review = true`. Empty state uses Vanta voice ("Nothing waiting on you. Clean desk."). Each card forces a lane pick before it leaves the queue.

Routing is implemented client-side first (no new edge fn): the action buttons call existing flows — insert into `commitments`, update `notes`, invoke `sherlock-investigate`, etc. Each route writes an `audit_log` row with event `capture.routed` so we get audit coverage for free.

### Stage 2 — Telegram + Companion capture visibility

- `messages` rows from telegram get `metadata.source = "telegram"` and `metadata.detected_type` already partly set by `telegram-webhook` — extend the webhook to also write `metadata.confidence` and `metadata.needs_review` when classification is fuzzy. (Small server-side edit, no behavior change for existing routes.)
- Companion-created captures already emit receipt cards; extend `useIntentHandler` to also stamp `metadata.detected_type` and emit an `audit_log` row `capture.routed` with the destination surface.
- The Captures lane reads these fields and renders the source/type/confidence/route chips uniformly across both channels.

### Capture Log rename (small, ships in this pass)

- `SurfaceTabs.tsx`: rename `Log` → `Capture Log` (label only; key stays `conversation`).
- `ConversationSurface`: add a slim banner at top: *"Capture only. Nothing here executes. Approvals live in Actions."* Add status chips next to user messages when `metadata.detected_type` is present (Captured · Routed · Needs review · Draft created).

### Voice + mobile polish (touched surfaces only)

- File ingest status copy: `pending → "Looking at it…"`, `done → "Saved"`, `failed → "Couldn't read this one"`, etc.
- Capture card stacks vertically <420px; chip row scrolls horizontally with snap; primary action button stays full-width on mobile.
- All copy reviewed for Vanta voice — no "Classification complete" anywhere.

## Part 3 — Staged but NOT built this pass

These are scoped so the next pass is one-shot:
- **Stage 3** — File pipeline visibility (per-file detected document type chip, summary preview, route suggestions). Needs `files-ingest` to write `metadata.document_type` and `metadata.summary`.
- **Stage 4** — Capture Log route/status chip layer beyond the banner.
- **Stage 5** — Memory grouping (People/Projects/Places/Files) using `notes.tags` + `note_links`.
- **Stage 6** — Notes type field + "convert to reminder/commitment" inline buttons. Needs `notes.type` column (migration).
- **Stage 7** — Audit events expansion (`capture.received`, `capture.classified`, `capture.routed`, `ambiguous.resolved`) wired into every channel.
- **Stage 8** — Typed-confirm destructive actions (DISABLE), Awareness chip polish.
- **Stage 9** — Full mobile validation pass on every touched surface at 390x844.

## Technical notes

Files I'll touch in this pass:
- `src/components/surfaces/MemorySurface.tsx` — add view toggle, mount new `CapturesView` + `AmbiguousView`.
- `src/components/memory/CapturesView.tsx` *(new)* — unified feed + filters.
- `src/components/memory/AmbiguousView.tsx` *(new)* — lane-picker cards.
- `src/components/memory/CaptureCard.tsx` *(new)* — shared card with source/type/confidence/route chips and action row.
- `src/components/shell/SurfaceTabs.tsx` — label rename.
- `src/components/surfaces/ConversationSurface.tsx` — banner + per-message status chips.
- `src/hooks/useIntentHandler.ts` — stamp `detected_type` + audit row.
- `supabase/functions/telegram-webhook/index.ts` — write `confidence` + `needs_review` into message metadata (additive, no behavior change for existing flows).
- `src/lib/vantaVoice.ts` — add capture/file status copy helpers.

No schema changes in this pass. No new tables. No deletions. No executions. Everything reads from tables that already exist and routes through existing edge fns. Audit gets new event names but uses existing `audit_log` schema.

Acceptance check before marking complete:
- Captures view renders real data from your seeded rows.
- Ambiguous view shows at least one item after seeding a low-confidence message.
- Telegram message shows source chip in both Capture Log and Captures view.
- Companion-created reminder shows up in Captures with route="commitments".
- "Log" tab reads "Capture Log" with the law banner visible.
- Mobile 390px pass on Memory + Capture Log.
