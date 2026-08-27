# Comprehension, Clarity, and Operational UX Pass

Four rooms stay. Street identity stays. Backend stays. No fifth room, no onboarding system, no new object types. The only goal: remove hesitation.

## Verified starting point

- `AftermathFooter` exists and already carries a "what happens if I tap" hint — but it is used in only five places (Sherlock findings, Captures view, Cockpit briefing, Connected Accounts). Most state-changing flows never show an aftermath.
- Vocabulary lives in three files (`plainLabels.ts`, `workLabels.ts`, `roomCopy.ts`) and already carries some canonical mapping (`capture -> Inbox`), but surfaces still hand-write nouns.
- There is no shared card meta-line component anywhere in the codebase.
- Section notes and helper familiarity already exist (`SECTION_NOTE`, `useHelperFamiliarity`), and collapsible sections with persistence already exist — so collapsed summaries and header trimming are edits, not new systems.
- Cockpit is five panels (bulletin, checklist, pulse, rollups, briefing); the density question needs an audit before any change.

## Phase 0 — Audit

Write `.lovable/vanta-comprehension-clarity-audit.md` classifying card metadata, labels, section copy, provenance, freshness, empty states, room headers, error copy, Cockpit, mobile at 384px, accessibility, and current tests as: already good / inconsistent / missing / over-explained / under-explained / reusable / needs consolidation / deferred.

## Slice 1 — Aftermath everywhere

Expand `AftermathFooter` (and a lighter inline aftermath line for toasts/confirmations) to flows that actually change state: routing a capture, approving/executing an action, recording a decision, completing or deferring a commitment, saving a draft, filing to a project, exporting a document. Copy shape: `Filed to Lamai rollout · appears in Receipts`. Remove helper text that the aftermath now says better. Trivial interactions get nothing.

## Slice 2 — Card meta line

One shared `CardMeta` component: `type · state · destination`, single line, truncating gracefully, no new badges. Wire it into the recurring card families (commitments, actions, captures, decisions, waiting-on, artifacts/documents, receipts, nudges). Type and destination come from the canonical label map, not from the surface.

## Slice 3 — One vocabulary

Pick one user-facing noun per object: Capture, Commitment, Action, Decision, Waiting On, Artifact, Receipt, Project, Responsibility. Consolidate into the existing label files, replace surface-local synonyms (capture/note/intake item, action/proposal/staged action). Section names like "Fresh in" may stay as section names; items inside use the canonical noun. Add an anti-drift test that fails when a known object type is hand-labeled.

## Slice 4 — Kill empty scaffolding

An empty section stops rendering header + helper + empty card + zero count together. Per room, either hide it, or show one muted line, or group empties into a single footer line ("Nothing here yet: Inbox, Sherlock, Documents"). Keeps the teaching empty-states doctrine where the room genuinely needs it.

## Slice 5 — Trim room headers

Each room header collapses to: room name, one state line ("2 things need you. Everything else is quiet."), one compact control cluster (scope, posture/mode, Explain This). Intro paragraphs, stacked helper copy, and duplicate expand controls move out or merge. First real row sits near the top.

## Slice 6 — Backend visibility, plain language

- Section-level freshness: `Checked 4 min ago`, `Synced just now`. Never per row.
- Provenance: one compact source marker (Telegram, Email, Calendar, You, Upload, Website, Sherlock, Vanta).
- "Why this?" on awareness/nudge rows, rendering the reason the pipeline already stored — never invented.
- One system-health line in Settings: green / amber / neutral, words not just color, tapping opens existing integration detail.

## Slice 7 — Errors that name the fix

Generalize the `aiErrors.ts` pattern into a shared error-copy helper: what broke, whether the user must act, one available action. No raw status codes or function names on normal surfaces.

## Slice 8 — Smarter collapsed defaults

At most one major section opens by default, chosen by real severity. Collapsed summaries become decision-grade: `3 commitments · nearest Friday`, `2 waiting · one follow-up tomorrow`, `4 decisions · 1 needs you today`. Reuses the existing persistence, no new mechanism.

## Slice 9 — Cockpit / density review

Audit only. Document Cockpit's unique vs duplicated value in `.lovable/vanta-density-review.md` and recommend either "keep as advanced tool" or "fold into a future progressive-density option". No removal in this pass.

## Slice 10 — Room map

One static Settings screen, "How Vanta Is Organized": four rooms, one sentence each, the objects each owns. Explain This gains a `See how Vanta is organized` link straight to it. No tour, no carousel.

## Technical notes

- New shared pieces only: `CardMeta`, a provenance chip, a freshness line, a `WhyThis` popover, an error-copy helper, the room-map screen. Everything else edits existing components.
- No schema changes. Every touched query keeps `applyScope`. Action safety unchanged — aftermath and meta lines never execute.
- Tests: vocabulary canonicalization + anti-drift, meta-line presence, aftermath placement, empty-section collapse, collapsed summary text, freshness/provenance/why-this rendering, health line, error copy, header compactness, Explain This map link, no cross-scope leakage. Full suite plus typecheck at each slice, plus a 384px overflow check.
- Docs: the audit, `.lovable/vanta-comprehension-system.md`, `.lovable/vanta-room-map.md`, `.lovable/vanta-density-review.md`.

## Sequencing

Slices 1–5 first — those change comprehension on first contact. Then 6–8. Then the Cockpit review and the room map.
