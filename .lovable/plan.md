# Sherlock + Research Protocol + Recap Intelligence — Audit/Design Pass

## Posture
Audit and design only. No routes, tables, migrations, AI calls, refactors, or UI moves in this pass. The single deliverable is one document.

## Deliverable
Create one file:
- `.lovable/sherlock-research-protocol-recap-audit.md`

No other file is created, edited, or deleted.

## Document Structure

The audit doc will follow the prompt's spine, grounded in what already exists in the codebase. Sections:

1. **Purpose & Posture** — restate the core principle (Sherlock = internal, Research = external, Vanta explains, recaps preserve story, user approves next move). Reaffirm: no implementation in this pass; respects in-flight Plain English / Collapsible / Motion / Daily Bulletin polish.

2. **Current State Inventory** (what exists today, grounded in real paths):
   - Sherlock surface: `src/components/surfaces/SherlockSurface.tsx`, overlay `SherlockOverlay.tsx`, settings `SherlockSettingsPanel.tsx`, hint/suggestion chips, finding card, review modal, embedded findings, `SherlockContext.tsx`.
   - Sherlock lib: `src/lib/sherlock/{lifecycle,sensitive,types}.ts`; hooks `useSherlockSettings`, `useSherlockCache`, `useSherlockPending`, `useSherlockFindings`.
   - Edge functions: `sherlock-investigate`, `sherlock-watch`, `sherlock-patterns`, `_shared/sherlockSuggest.ts`, `_shared/sensitive.ts`.
   - Research surface: `src/components/research/ResearchPanel.tsx`, edge `research-run`.
   - Recap-adjacent surfaces today: `DailyBulletinCard`, `DailyChecklistCard`, `OperationsBriefingPanel`, `ProductivityPulseCard`, `ProjectRollupCards`, `briefing-compose`, `ambient-pulse`, `awareness-brief`.
   - Living Brief / Projects: `LivingBriefBlocks`, `ProjectBriefView`, `project-summarize`.
   - Cross-cutting: `vantaSignal.ts`, `useSignalRoute.ts`, `receiptResolve.ts`, `NudgesPanel.tsx`, entity graph, audit drawer.
   - For each: one-line "what it does, what it touches, what it exposes to the user."

3. **Gap Analysis** — what is isolated vs protocol-shaped:
   - Sherlock is still page-shaped (surface + overlay). Findings exist but don't quietly steer Inbox routing, Project suggestions, Brief composition, or Command Center beyond chips.
   - Research is a panel users must visit; no contextual suggestion pattern, no queue, no source receipts surface.
   - Recap layer: daily exists; weekly/monthly do not. No recap settings, no roll-up storage strategy, no brief save path.
   - Receipts: per-finding receipts exist; no unified "why Vanta suggested this" receipt across Sherlock + Research + Recap.
   - Language: identify any remaining raw labels surfaced to users (against the banned list on page 8 of the prompt).

4. **Target Architecture (logical, no code)**
   - Sherlock = internal awareness protocol. Page becomes Advanced/History/Settings/Receipts.
   - Research = external awareness protocol. Page becomes Queue/Approved/Briefs/Sources/Settings.
   - Shared "suggestion bus" concept (logical, not implemented): produces plain-English chips/banners across Inbox, Projects, Command Center, Living Brief, OpenCanvas, Briefs/Exports.
   - Receipts: unified "Why?" expandable on every surfaced suggestion.

5. **Where Sherlock Should Appear** — Inbox, Command Center, Projects, Living Brief, OpenCanvas, Briefs/Exports. Each with example plain-English copy from the prompt and the corresponding existing component it would attach to.

6. **Where Research Should Appear** — Project context, Living Brief gaps, Command Center suggestion, Briefs appendix. Approval gates, queue surface, source receipts.

7. **Recap Intelligence Design**
   - Daily Bulletin: extend with Sherlock pattern alerts + Research activity rows (no new tabs).
   - Weekly Recap: "Living Brief for the whole system" — content blocks, tone options, delivery options.
   - Monthly Review: pattern-formation summary — content blocks, controls.
   - Storage idea: recaps live as `brief_exports` rows with a recap scope (logical proposal — not migrated in this pass).

8. **UI Presence Layer** — micro-presence patterns (chips, soft banners, pulse, slide-in toasts, bottom sheets, hover cards, "Why?" receipts). Explicit list of what to avoid (large modals, spam, raw labels).

9. **Mobile vs Desktop Behavior** — patterns per form factor; consistency rule.

10. **Motion Rules** — motion explains state change only.

11. **Settings / Trust Layer ("What Vanta can see")** — proposed sections, fully user-controlled. Daily/Weekly/Monthly recap controls. Tone options. Delivery options.

12. **Automation Guardrails** — allowed-with-settings vs explicit-approval vs never-automatic, mapped to existing actions/transitions infra.

13. **Banned User-Facing Language** — verbatim list + a sweep table noting any current strings to revisit later (no edits in this pass).

14. **Phased Plan (design only, not executed here)**
    - Phase 1: this audit.
    - Phase 2: Sherlock background guidance across Inbox + Projects.
    - Phase 3: Research suggestions (approval-gated).
    - Phase 4: Research briefs → project attach → Living Brief update → receipts.
    - Phase 5: Recap intelligence (Daily roll-up → Weekly → Monthly + settings).
    - Phase 6: OpenCanvas intelligence (clusters, source cards).
    - Phase 7: Documents / Contract Intelligence integration.
    - Phase 8: Device / native signals.
    - For each phase: scope, what it touches (existing files), what it must NOT touch, exit criteria.

15. **Explicit Non-Goals for this pass** — no migrations, no new edge functions, no UI moves, no relabel sweep, no Sherlock/Research page restructure yet.

## Process

1. Read the relevant existing files (Sherlock components/lib/hooks/functions, Research panel + edge, recap-adjacent cockpit + brief + recap infra, Living Brief, receipts, audit).
2. Write the document in one pass following the structure above.
3. Stop. No other files change.

## Out of Scope (this pass)
- Any code edit outside the new audit markdown.
- Any DB migration or edge-function change.
- Any user-visible UI change.
