# Sherlock + Research Protocol + Recap Intelligence — Audit / Design Pass

> **Posture:** Audit and design only. No routes, tables, migrations, AI calls, refactors, or UI moves in this pass. The single deliverable is this document. Anything that ships will go through a later, separately-approved phase.

---

## 1. Purpose & Core Principle

- **Sherlock** is the internal awareness protocol. It investigates everything Vanta is already allowed to see.
- **Research** is the external awareness protocol. It supports what Vanta needs to understand from outside context.
- **Vanta** explains both in plain English.
- **Daily / Weekly / Monthly recaps** preserve the story over time.
- **The user** approves what happens next. Receipts prove what happened.

This pass respects in-flight work and does not undo it:
- Plain-English UI polish
- Collapsible UI polish
- Motion / animation polish
- Command Center Daily Bulletin polish
- "No raw jargon on user-facing surfaces"

Sherlock and Research inherit those same standards.

---

## 2. Current State Inventory

### 2.1 Sherlock — what exists today

| Path | What it does | Surfaces it touches |
|------|--------------|---------------------|
| `src/components/surfaces/SherlockSurface.tsx` | Main Sherlock destination — list / detail / settings shell. | Sherlock tab. |
| `src/components/sherlock/SherlockOverlay.tsx` | Heavyweight "investigate this" overlay launched from triggers. | Inline across capture/file/note surfaces. |
| `src/components/sherlock/SherlockContext.tsx` | React context exposing findings + lifecycle actions. | Used by hint chip, suggestion chip, finding card, review modal. |
| `src/components/sherlock/SherlockSettingsPanel.tsx` | User-facing Sherlock settings. | Sherlock surface / settings. |
| `src/components/sherlock/SherlockHintChip.tsx`, `SherlockSuggestionChip.tsx`, `SherlockChipTrigger.tsx` | Inline chips that hint at findings or trigger investigation. | Memory, capture, project surfaces. |
| `src/components/sherlock/SherlockFindingCard.tsx`, `SherlockReviewModal.tsx`, `EmbeddedSherlockFindings.tsx` | Render a single finding, review it, embed lists. | Project / Inbox / Sherlock page. |
| `src/components/sherlock/AnalyzeButton.tsx`, `MarkSensitiveButton.tsx` | Manual triggers + sensitivity tagging. | File / capture cards. |
| `src/lib/sherlock/lifecycle.ts`, `sensitive.ts`, `types.ts` | Client-side lifecycle / sensitivity / type model. | Used by hooks + components. |
| `src/hooks/useSherlockSettings.ts`, `useSherlockCache.ts`, `useSherlockPending.ts`, `useSherlockFindings.ts` | Settings + finding/cache hooks. | Anywhere Sherlock data is consumed. |
| `supabase/functions/sherlock-investigate/index.ts` | On-demand investigation. | Called from AnalyzeButton / overlay. |
| `supabase/functions/sherlock-watch/index.ts` | Background watcher entry point. | Sherlock pipeline. |
| `supabase/functions/sherlock-patterns/index.ts` | Pattern detection across items. | Pattern chips / surface. |
| `supabase/functions/_shared/sherlockSuggest.ts`, `_shared/sensitive.ts` | Shared suggestion + sensitivity helpers. | Shared across edge functions. |

**Status read:** Sherlock today is page-shaped. Findings exist and chips surface them, but the protocol is mostly opt-in via the Sherlock surface, the overlay, and the AnalyzeButton. The "ambient" presence is partial.

### 2.2 Research — what exists today

| Path | What it does |
|------|--------------|
| `src/components/research/ResearchPanel.tsx` | Single research panel — user goes to it and asks. |
| `supabase/functions/research-run/index.ts` | Runs a research request. |

**Status read:** Research is a destination. There is no contextual "want me to look outside?" pattern, no queue, no approved/completed split, no source receipts surface, and no project-attached research brief flow.

### 2.3 Recap-adjacent surfaces today

| Path | Today's role |
|------|--------------|
| `src/components/cockpit/DailyBulletinCard.tsx` | Daily Bulletin in Command Center. Recently polished for plain English. |
| `src/components/cockpit/DailyChecklistCard.tsx` | Daily checklist companion. |
| `src/components/cockpit/OperationsBriefingPanel.tsx` | Ops-side briefing. |
| `src/components/cockpit/ProductivityPulseCard.tsx` | Activity pulse. |
| `src/components/cockpit/ProjectRollupCards.tsx` | Per-project rollups in cockpit. |
| `supabase/functions/briefing-compose/index.ts`, `compose-brief/index.ts` | Brief composition. |
| `supabase/functions/ambient-pulse/index.ts` | Background pulse signals. |
| `supabase/functions/awareness-brief/index.ts`, `awareness-*` | Awareness layer. |
| `src/components/projects/LivingBriefBlocks.tsx`, `ProjectBriefView.tsx` | Living Brief render. |
| `supabase/functions/project-summarize/index.ts` | Project summary generator (now wired to Documents preset). |
| `src/lib/briefs.ts`, `src/components/briefs/*` | Brief storage / render / export. |

**Status read:** Daily exists in spirit. Weekly and Monthly recaps do not. There is no recap settings panel, no recap storage convention (could reuse `brief_exports`), and no save-to-Briefs / Project path for recaps.

### 2.4 Cross-cutting infra (already present)

- `src/lib/vantaSignal.ts`, `src/lib/useSignalRoute.ts` — signal routing.
- `src/lib/receiptResolve.ts`, `src/components/audit/AuditDetailDrawer.tsx` — receipts / audit.
- `src/components/NudgesPanel.tsx` — existing nudge presence.
- `src/components/entities/*` — entity graph + canvas.
- `src/lib/projectHealth.ts`, `src/lib/projects.ts` — project state.

These are the rails any Sherlock/Research surfacing should ride. Do not duplicate them.

---

## 3. Gap Analysis

1. **Sherlock is still a destination.** Findings don't quietly steer Inbox routing chips beyond the existing hint, don't shape Project suggestions deeply, and don't feed Living Brief blocks or Command Center beyond chips.
2. **Research is a manual page.** No "Vanta noticed — want me to look outside?" suggestion pattern. No queue. No project-attached brief flow with source receipts.
3. **Recap layer is incomplete.** Daily exists; weekly and monthly do not. No recap settings, no roll-up storage, no save-to-Briefs/Project path.
4. **Receipts are siloed.** Per-finding receipts exist via the audit drawer, but there is no unified "Why Vanta suggested this" expand-on-any-card pattern across Sherlock + Research + Recap.
5. **Language drift risk.** Banned terms (see §13) still risk leaking from edge-function payloads to user-facing chips. Needs a future sweep — not in this pass.
6. **No suggestion bus.** Each surface re-implements its own hint/chip wiring instead of sharing a single ambient "Vanta noticed X" pipe.

---

## 4. Target Architecture (logical, not implemented)

- **Sherlock = internal awareness protocol.** The page becomes Advanced / History / Settings / Manual deep-dives / Receipts. Default Sherlock lives in the background.
- **Research = external awareness protocol.** The page becomes Queue / Approved / Completed briefs / Saved sources / Settings / Source history. Default Research surfaces as a contextual suggestion.
- **Shared "suggestion bus"** (logical concept): Sherlock and Research emit plain-English suggestions consumed by Inbox, Projects, Command Center, Living Brief, OpenCanvas, Briefs/Exports. Every suggestion carries: outcome label, source surface, expandable "Why?" receipt, approval action.
- **Receipts unification:** every surfaced suggestion has an inline "Why?" that resolves to the existing audit/receipts drawer. No new receipts system.

This is a logical model. No new tables, edge functions, or routes are created here.

---

## 5. Where Sherlock Should Appear

| Surface | Plain-English copy (examples) | Attaches to (existing) |
|---------|-------------------------------|------------------------|
| **Inbox** | "Looks related to Ground Stay." • "Possible duplicate." • "Similar to 3 other captures." • "Ready to attach." • "Ready to summarize." | `InboxNotesList`, `AttachToProjectMenu`, `BulkAttachToProjectMenu`, `SherlockHintChip` |
| **Command Center** | "Ground Stay payment issue came up again." • "Two items may need review." • "This week's top pattern: booking flow." | `DailyBulletinCard`, `NudgesPanel`, `AwarenessHUD` |
| **Projects** | Repeated themes, unresolved issues, contradictions, risks, items to attach or summarize. | `ProjectInbox`, `ProjectBriefView`, `ProjectRollupCards` |
| **Living Brief** | Quietly improves Overall Summary, Key Topics, Decisions, Risks, Next Move. Not named in the brief unless inside an optional "Why this was suggested" detail. | `LivingBriefBlocks` |
| **OpenCanvas** | Visual clusters: Payments, Calendar, Contact Flow, Risks, Decisions, Open Questions, Documents, Research Sources, Timeline Events. | `entities/CommandCanvas`, entity graph |
| **Briefs / Exports** | "Include this risk?" • "These items repeat — group?" • "Receipts available." | `BriefComposerSheet`, `BriefRenderer`, `BriefExportsList` |

User-facing rule: **outcome language, never internal labels.**

---

## 6. Where Research Should Appear

- **Contextual project banner.** "Ground Stay has repeated booking-deposit questions. Want Vanta to gather outside examples?"
- **Living Brief gap chip.** When a Risk or Open Question reads thinly, surface "Outside context may help — research?"
- **Command Center row.** "Research suggestion ready for Ground Stay." Tap to approve or dismiss.
- **Briefs appendix prompt.** At export time: "Include research appendix?" (only if a completed research brief is attached).

Flow: Vanta notices → Research suggestion appears → user approves → Research runs → findings attach to Project → Living Brief can update → Receipts/source links stay attached → Export can include appendix.

Approval gates are non-negotiable. Research never runs automatically unless explicitly enabled in settings.

---

## 7. Recap Intelligence Design

### 7.1 Daily Bulletin (extend; do not rebuild)
Answers: *What changed since you last checked?*
Add (later phase): project movement, new captures, exports saved, items cleaned up, things needing attention, integrations activity, Sherlock pattern alerts, Research suggestions or completed research, quiet/inactive signals when useful.

Surface: existing `DailyBulletinCard`. No new tab.

### 7.2 Weekly Recap (new, but minimal surface)
Answers: *What actually happened this week?* — a Living Brief for the whole system.

Blocks:
- Overall week summary
- Most active projects
- Needs attention
- Completed / handled
- New material
- Sherlock patterns
- Research activity
- Quiet / inactive areas
- Exports saved
- Receipts underneath

Example output:
> Ground Stay carried most of the week. The main activity centered on booking flow, payment logic, calendar availability, and contact-page cleanup. Vanta also cleaned up stale captures and saved several exports. CampCore stayed quiet with no urgent movement. The main open item is still a final review of Ground Stay booking/payment behavior.

### 7.3 Monthly Review
Answers: *What bigger pattern is forming?* Summarizes most active projects, recurring themes, unresolved issues, exports and briefs, research output, operational trends, quiet projects, notable changes, what improved, what still needs attention.

### 7.4 Storage proposal (logical, not migrated this pass)
- Reuse `brief_exports` with a `scope_kind` of `recap_daily` / `recap_weekly` / `recap_monthly`.
- Recaps that are project-specific attach to the project the same way Living Brief exports do.
- No new table needed for the first cut. Reassess only if scope fields can't carry it.

---

## 8. UI Presence Layer

**Use:** small insight chips, soft inline banners, tiny pulse/glow on relevant cards, slide-in toast when something connects, bottom-sheet suggestions on mobile, right-side panel / hover card on desktop, subtle "Vanta noticed…" badges, expandable "Why?" receipts, gentle card motion when items group / attach / dismiss / move, calm warning style for conflicts, short "Research ready" arrival state.

**Avoid:** large blocking modals, constant popups, spammy "Vanta noticed" everywhere, raw Sherlock labels, raw Research process language, forcing users to open Sherlock or Research pages.

**Rule:** Subtle everywhere. Loud nowhere. Useful always.

---

## 9. Mobile vs Desktop Behavior

- **Mobile (384px is the validation target):** bottom sheets, collapsed sections, swipe actions, one main action per card, small insight chips, tap-to-expand details, short toasts, soft animations, no giant popups unless approval is required.
- **Desktop:** side panels, hover previews, split views, Canvas insight drawer, richer context panels, project-side suggestion drawers, Research queue side panel, receipt/why panels.

Language and behavior stay consistent across both. Desktop provides more room, not more clutter.

---

## 10. Motion Rules

Motion explains state change. No decoration-only animation. Examples: an item gliding into a project on attach, a chip pulsing when a new pattern is detected, a soft slide-in for "Research ready."

---

## 11. Settings / Trust Layer — "What Vanta Can See"

User-controlled sections (logical proposal):

- Connected sources and per-source permissions
- Sherlock suggestion behavior (on/off per surface, sensitivity, pattern alerts)
- Research suggestion behavior (off / suggest only / suggest + auto-run with approval)
- Device-aware inputs (future)
- Notification behavior (channels, quiet hours)
- Recap behavior (daily / weekly / monthly)
- What gets saved vs deleted
- What appears in Command Center

### Recap controls
- **Daily Bulletin:** on/off, time, short or detailed, what to include, ask before exporting PDF.
- **Weekly Recap:** on/off, day of week, time, short or detailed, include project breakdown, include inactive projects, include receipts appendix, include Research activity, include Sherlock patterns, save to Briefs automatically, ask before exporting PDF, notification on ready.
- **Monthly Review:** on/off, first or last day of month, include project trends, include unresolved items, include exports and receipts, include quiet/inactive areas, include Research activity, include Sherlock patterns, save to Briefs automatically, ask before exporting PDF, notification on ready.

### Tone options
Direct • Professional • Operator • Client-ready • Short • Detailed.

### Delivery options
Show in Command Center • Save to Briefs • Save to Project (if project-specific) • Export PDF • Send notification • Email later (only if connected and approved).

---

## 12. Automation Guardrails

| Tier | Examples |
|------|----------|
| **Allowed with settings** | Prepare Daily Bulletin, generate Weekly Recap, generate Monthly Review, save recap to Briefs, show recap in Command Center, notify user recap is ready. |
| **Requires explicit approval** | Export recap as PDF (if not pre-enabled), email recap, send recap to another person, share recap externally, attach recap to client-facing packet, run Research, take action on a Sherlock suggestion. |
| **Never automatic** | Send to Nikki without approval, send to client without approval, modify project decisions silently, execute legal/business actions, publish anything externally, silently research sensitive topics, silently inspect device data. |

Maps onto existing `actions-execute` / `actions-transition` Plan→Approve→Execute infra. No new execution path is introduced.

---

## 13. Banned User-Facing Language

Never show to the user:
- Sherlock protocol inference event
- finding cache updated
- signal detected
- entity candidate routed
- suggest:message / extract:message
- source_event_count
- webhook received
- vector index updated
- AI run complete
- Gemini processed
- raw event / lifecycle state
- deduplication engine
- confidence score
- database updated
- "high confidence" / "low confidence"
- "AI protocol detected"

Replace with outcome language: *Likely useful • Worth reviewing • Needs review • Possible duplicate • Looks connected • Ready to summarize.*

A future sweep will grep current surfaces against this list. **Not done in this pass.**

---

## 14. Phased Plan (design only — phases are not executed here)

### Phase 1 — Audit / Design (this document)
Map Sherlock, Research, Recaps, UI micro-presence, integrations, device future, settings. **Exit:** this file merged.

### Phase 2 — Sherlock Background Guidance
Apply Sherlock signals across Inbox + Projects.
- Touches: `InboxNotesList`, `AttachToProjectMenu`, `ProjectInbox`, `ProjectBriefView`, `SherlockHintChip`, `useSherlockFindings`.
- Must not touch: Sherlock page structure, Research, recap surfaces, edge schemas.
- Exit: routing hints, duplicates, related captures, repeated themes, possible conflicts, ready-to-summarize groups all surface as plain-English chips with "Why?" receipts.

### Phase 3 — Research Suggestions
Add contextual Research suggestions (approval-gated).
- Touches: `ProjectBriefView`, `DailyBulletinCard`, new lightweight suggestion chip, `ResearchPanel` (as queue host).
- Must not touch: automatic research execution, Sherlock internals.
- Exit: project-level research prompts visible, Research queue exists, receipts attached.

### Phase 4 — Research Briefs
Approved request → source gathering → research brief → attach to project → Living Brief update → receipts.
- Touches: `research-run`, `briefs` storage, `LivingBriefBlocks`, project attach helpers.
- Must not touch: recap layer, OpenCanvas.
- Exit: full research-to-brief loop with receipts.

### Phase 5 — Recap Intelligence
Daily Bulletin signals roll into Weekly Recap and Monthly Review. Add recap settings. Save recaps under Briefs / Reports.
- Touches: `DailyBulletinCard`, new weekly/monthly composers (likely extending `briefing-compose` / `compose-brief`), `brief_exports` scope, settings page.
- Must not touch: Sherlock/Research page restructure.
- Exit: weekly and monthly recaps generate, save, and surface in Command Center under user-controlled settings.

### Phase 6 — OpenCanvas Intelligence
Sherlock clusters and Research source cards appear visually.
- Touches: `entities/CommandCanvas`, entity graph helpers.
- Must not touch: recap, brief export.
- Exit: risk maps, decision maps, source cards, topic clusters render.

### Phase 7 — Documents / Contract Intelligence Integration
Park-until-ready hook. Sherlock cross-doc analysis, obligation tracking, attorney-handoff packet, outside-context research per document.

### Phase 8 — Device / Integration Native Signals
Only after the core flow is stable. Mobile share sheet, screenshots, voice notes, desktop file drops, calendar read-only context, future WhatsApp.

---

## 15. Explicit Non-Goals For This Pass

- No migrations.
- No new edge functions.
- No UI changes.
- No relabel sweep.
- No restructure of the Sherlock or Research pages.
- No new tabs, routes, or settings panels.
- No automatic AI calls.

The only output of Phase 1 is this document. Every subsequent phase is approved separately.
