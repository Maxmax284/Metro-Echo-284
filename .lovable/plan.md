# Vanta Next-Stage Plan (staged, not a mega-sprint)

Source of truth: the uploaded prompt + the platform audit. Build order is non-negotiable. Each phase ships and is validated on the 384px viewport before the next opens. Doctrine holds: capture never executes, Plan → Approve → Execute, manual first, AI second, Sherlock third.

What already exists that we reuse (no rebuilds):
- `src/lib/vantaVoice.ts` + `supabase/functions/_shared/vantaVoice.ts` — voice layer is real. Phase 1 is *consolidation*, not creation.
- `src/lib/entityGraph.ts` + `supabase/functions/_shared/entityGraph.ts` + `entities` / `entity_links` tables — Phase 4 substrate already partially exists.
- `sherlock-investigate` + `sherlock-watch` — Phase 3 modes layer on top, no new tables.
- `MemoryFilesView`, `files-ingest`, `email-inbound`, `telegram-webhook` — Phase 2 plugs into these.
- `NudgesPanel` / Attention Queue — Phase 5 briefings render here, no new surface.

---

## Phase 1 — Voice Layer Consolidation (small)
Make every surface pull from the central voice config. No new surfaces.

Work:
- Audit `vantaSay` / `VANTA_CORE_VOICE` usage across: `CompanionWidget`, `NudgesPanel`, `SherlockOverlay`, `AwarenessHUD`, briefing cards, reminder composer toasts, error toasts, empty states, Telegram bot replies (`telegram-webhook`), push payloads (`commitment-reminders`, `push-test`).
- Replace any hardcoded strings matching the forbidden list ("How can I help…", "Something went wrong", "Certainly!", "Unlock your…") with `vantaSay.*` entries.
- Extend `vantaVoice.ts` with: `errors.*`, `empty.*` (per surface), `telegram.*`, `push.*`, `briefing.*`, `sherlock.*` if missing. Mirror in the edge `_shared/vantaVoice.ts`.
- Add a vitest guardrail (`voice-guardrail.test.ts` already exists — extend) that greps `src/components/**` and fails on forbidden phrases.

Acceptance: zero forbidden phrases in repo grep; same tone across chat, briefings, reminders, Sherlock, Telegram, push, errors, empty states.

---

## Phase 2 — Capture Inbox + File Intake Routing
Turn the existing Memory/Files surfaces into one triage inbox. No new top-level tab.

Work:
- New `src/components/memory/CaptureInbox.tsx` that unions: untriaged captures, untriaged files, Telegram drafts, inbound emails, link drops. Lives inside the Memory surface as the default sub-view.
- New `triage_status` column on `captures`, `files`, `messages` (pending|routed|archived). Migration + RLS.
- Triage action bar (reusing existing chip components): Save as note · Reminder · Commitment · Action · Attach to… · Add to briefing · Send to Sherlock · Map this · Archive · Ignore. Each routes through the existing `useIntentHandler` (no new write paths).
- File detail sheet additions: "What is this?" "Are there dates / names / payments / deadlines?" — buttons call `sherlock-investigate` in `extract` mode (Phase 3).
- Sensitive-file flag: heuristic on filename + extracted text (passport, visa, medical, invoice) → renders neutral warning copy from `vantaSay.sensitive`.

Schema (migration):
- `alter table captures add column triage_status text default 'pending'`
- same for `files`, `messages` (only where missing)
- index on `(user_id, triage_status)`

Acceptance: every uploaded file and inbound message lands in inbox; user can route to note/reminder/commitment/action with one tap; nothing auto-routes; sensitive copy fires on flagged files.

---

## Phase 3 — Sherlock 2 (Observe / Extract / Relate / Suggest / Investigate)
Extend `sherlock-investigate` with a `mode` param. No new functions, no new tables.

Work:
- Edge: `sherlock-investigate` accepts `mode: 'observe'|'extract'|'relate'|'suggest'|'investigate'`. Each mode is a different system prompt + structured JSON output schema. `investigate` is the current behavior.
- Findings written to existing `sherlock_findings` with `origin = mode`.
- Surface: AnalyzeButton already exists — add mode picker (compact). Findings render as cards in Attention Queue.
- Hard rule wired into prompt: "Recognition is not execution. Draft only. Confidence required. No medical/legal/financial conclusions."
- Voice: all output through `SHERLOCK_VOICE`.

Acceptance: each mode returns structured findings; every finding is a dismissible draft with audit event; zero new push notifications.

---

## Phase 4 — Object Relationship Hardening
Build on the existing `entities` / `entity_links` graph. Add `entity_relations` + approval state.

Work:
- Migration: create `entity_relations` (already specced in `.lovable/phase3-command-canvas.md`); add `approval_state` (`suggested|approved|rejected`) and `created_by` (`user|sherlock|chat|system`) to `entity_links` and `entity_relations`.
- `linkEntities` helper writes with `approval_state='suggested'` when AI-generated, `'approved'` when user-initiated.
- UI: `EntityDetailSheet` gets a Relations tab — list approved + pending suggestions with Approve / Reject buttons. Reuse `LinkChips`.
- Connected-items strip on commitment / note / file detail views (read from `entity_links` joined to source).
- Audit event `entity.relation.*` for every state change.

Acceptance: every object detail view shows connected items; user can approve/reject suggested links; no duplicate entities (dedupe by alias + embedding cosine already in helper).

---

## Phase 5 — Briefings V2
Pull from real operational objects, render in existing briefing card. No new surface.

Work:
- New edge function `briefing-compose` (scheduled morning + evening) that queries: overdue commitments, due-today, untriaged inbox items, stale items, last 24h captures, pending Sherlock findings.
- Output shape: `{ headline, counts, best_first_move, items[] }`. Stored in existing `briefings` table (or create if missing).
- `DailyBriefingCard` reads latest briefing for the user's local day.
- Project/cluster briefing = same composer scoped by `entity_id`.
- Voice via `vantaSay.briefing` — short, operator tone, no fluff.

Acceptance: morning briefing fires at user's local 7am with a single best-next-move line; evening briefing summarizes completed / slipped / rollover; no motivational copy.

---

## Phase 6 — Command Canvas Foundation (cards → timeline → board)
`CommandCanvas` already exists as a v0 shell. Iterate it in three sub-phases, *do not* jump to graph view.

6a. Relationship cards view — stacks of entity cards with connected-items chips. Reuse existing card components.
6b. Timeline view — chronological strip of objects filtered by entity / project. Pure read from existing tables.
6c. Board view — kanban-style columns (Pending / Active / Waiting / Done) drag-drop status changes through `actions-transition`.

Defer: flow view, full graph, AI clustering. Documented in `.lovable/phase3-command-canvas.md`.

Acceptance: each sub-phase removable without breaking other surfaces; all actions emit existing audit events; works at 384px; pinch-zoom on mobile.

---

## Phase 7 — Ecosystem Hooks Roadmap (doc only)
New file `.lovable/phase7-ecosystem.md`. No code.

Contents: event taxonomy for Website / GroundStay / CampCore / Fenrir Lock / Aware / Telegram / future (WhatsApp, Calendar, Email, Voice). Each event maps to a Vanta object type + required approval rule. Read-only adapters first, event→capture second, capture→commitment third, automated actions last and only with approval rules. WhatsApp explicitly blocked until Telegram is proven on Vanta + GTH.

---

## Files to create
- `src/components/memory/CaptureInbox.tsx`
- `.lovable/phase7-ecosystem.md`
- `supabase/functions/briefing-compose/index.ts`
- migrations: `triage_status` columns; `entity_relations` table; `approval_state` + `created_by` on link tables; `briefings` table if missing

## Files to modify
- `src/lib/vantaVoice.ts` + `supabase/functions/_shared/vantaVoice.ts` (extend)
- `src/components/memory/MemorySurface.tsx` / `CapturesView.tsx` / `MemoryFilesView.tsx` (mount inbox)
- `supabase/functions/sherlock-investigate/index.ts` (mode param)
- `src/components/sherlock/AnalyzeButton.tsx` (mode picker)
- `src/components/entities/EntityDetailSheet.tsx` (Relations tab)
- `src/components/schedule/DailyBriefingCard.tsx` (read v2)
- `src/components/entities/CommandCanvas.tsx` (6a/6b/6c)
- `src/lib/entityGraph.ts` + edge `_shared/entityGraph.ts` (approval state)
- `src/test/voice-guardrail.test.ts` (extend)

## Risk notes
- Schema changes in P2 and P4 must be backfilled (existing rows default to `triage_status='pending'`, `approval_state='approved'` for legacy links).
- Sherlock mode prompts must hold the line on "recognition ≠ execution" — guard with vitest snapshot of system prompts.
- Briefing scheduler needs per-user timezone (already in `useUserTimezone`).
- Canvas sub-phases must stay opt-in until 6a proves out on real data — no demo seeding.

## Intentionally deferred
- WhatsApp bridge (after Telegram rock-solid on Vanta + GTH + CampCore).
- Full graph view in Canvas.
- Productivity scores, gamification, team features.
- Any new paid APIs.
- Cross-project (GTH / CampCore / Fenrir) adapters — Phase 7 doc only.

## Sequencing rule
Ship Phase 1 → validate → Phase 2 → validate → ... No phase merges. If a phase exceeds one PR, split into sub-phases (P2 splits cleanly into inbox UI vs file routing; P6 already split 6a/b/c).
