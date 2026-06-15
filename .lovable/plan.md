# Vanta Polish Pass — Plain English, Collapsibility, Calm Motion

A surgical cleanup of Command Center + Inbox. No new tables, migrations, AI calls, routes, or features. Documents/Export work is paused for this pass.

## 1. Plain-English Language Pass

Centralize all user-facing event/status copy in one place so it never drifts again.

- Extend `src/lib/plainLabels.ts` and `src/lib/bulletinLanguage.ts` with a single `humanizeEvent()` map covering every banned phrase from the brief:
  - `Briefing read` → `Brief was opened`
  - `Brief created` → `New brief created`
  - `Capture routed` → `Capture was organized`
  - `Telegram message in` → `New Telegram note came in`
  - `Connected to a project` → `Attached to a project`
  - `Open in memory` → `Open saved note`
  - `Entity graph` → `Connections`
  - `high confidence` → `Likely useful`
  - `Pending Sherlock review` → `Possible duplicate`
  - `Already saved to memory` → `Saved to memory`
- Banned token guard: a tiny dev-only assertion in the formatter that strips/replaces `record inserted`, `signal detected`, `lifecycle state`, `briefing.viewed`, `briefing.composed`, `webhook received`, `suggest:message`, `extract:message`, etc.
- Rewrite Daily Bulletin top-line composer: short, natural sentences, no "and a few more" — use compact counts.
- Today card subtitle → "Your quick check-in for today."
- Inbox "Not connected yet…" → "Not connected yet. Attach this so Vanta knows where it belongs."

Files: `src/lib/plainLabels.ts`, `src/lib/bulletinLanguage.ts`, plus consumer call-sites in cockpit/inbox/bulletin/today components.

## 2. Shared Collapsible + More primitives

Two small shared components so collapsibility/menus stay consistent:

- `src/components/ui/CollapsibleSection.tsx` — header with title, count chip, short summary phrase, smooth accordion (200–300ms, ease-out), `defaultOpen` prop. Respects `prefers-reduced-motion`.
- `src/components/ui/CardMoreMenu.tsx` — thin wrapper over existing dropdown for "More" actions on inbox/cockpit cards.

## 3. Command Center / Cockpit collapsibility

In `DailyBulletinCard.tsx`, `DailyChecklistCard.tsx`, `OperationsBriefingPanel.tsx`, `ProductivityPulseCard.tsx`, `ProjectRollupCards.tsx`, and the system-ish tiles in `src/pages/Index.tsx`:

- Open by default: Daily Bulletin, Needs you (only if count > 0), Today/Next move (if active item).
- Collapsed by default with count + phrase: New captures, Done and saved, Quiet cleanup, Receipts, Memory Pulse, Connected sources, System details, Dismissed/stale.
- Projects card: cap to 2–3 most relevant; keep existing CALM language.
- Calm empty states when Today has no urgent items.

## 4. Inbox card redesign (`InboxNotesList.tsx`)

Reduce every card to: title/preview → source chips → short status line → **one primary** + **one secondary** + **More**.

- Primary-action rules:
  - Not attached → `Attach to project`
  - Likely project known → `Attach to [Project Name]`
  - Already attached → `Open project`
  - Needs review → `Review`
  - Saved & done → collapse or `Open saved note`
- Move into More: connect person/place, open saved note, view source, show receipt, advanced connection actions.
- Replace `+person/+project/+place` button row with single Attach sheet trigger.
- Use "Saved" / "In memory" instead of arrow-to-memory chips.

## 5. Calm motion layer

Small motion primitives (CSS + framer-motion if already present; otherwise pure CSS transitions — no new deps):

- Bulletin load: fade-in, sections settle (180–240ms).
- Accordion expand/collapse: 200–300ms ease.
- Attach: card settles into "Attached to [Project]" confirmation.
- Dismiss: slide-left/fade + "Hidden from Command Center" toast.
- Export saved: checkmark pulse + plain-English toast.
- Bottom nav active icon: subtle lift/glow.
- Needs-you alert: gentle one-time glow, no loop.
- Honor `prefers-reduced-motion` → replace with fades or instant changes.

## 6. Aesthetic micro-polish (no theme change)

- Increase spacing in dense chip rows.
- Soft dividers replace heavy boxes where used.
- Ensure 44px tap targets and no horizontal chip scroll on 390px.
- Max two visible actions per card.

## 7. Preserve (must not regress)

Daily Bulletin position, Slice 5 exports, Slice 6 intake lifecycle, dismissed/stale persistence, grouped captures, attach-to-project, receipts internal completeness, Documents Beta page & banner, no new AI calls, no new tables.

## Technical notes

- All copy goes through `humanizeEvent()` / existing `plainLabels` — no inline strings in components.
- `CollapsibleSection` uses `useReducedMotion` (if framer-motion present) or `@media (prefers-reduced-motion)` CSS guard.
- Motion timings defined as CSS variables in `index.css` (`--motion-fast: 160ms`, `--motion-base: 220ms`, `--motion-slow: 280ms`) for consistency.
- Dev-mode console warning if a banned token reaches the formatter — silenced in prod.

## Out of scope (explicit)

Documents/Contract Intelligence, Export Polish templates, OpenCanvas Phase 2, theme customizer, new AI calls, new migrations, rebuilding Command Center.

## Acceptance check (post-build)

Run the brief's manual test script at 384–390px: bulletin first, short human summary, non-urgent sections collapsed with counts, inbox cards show one primary action, language audit shows zero banned tokens, reduced-motion replaces slides with fades.

&nbsp;

Vanta Polish Pass — Plain English, Collapsibility, Calm Motion

&nbsp;

This is a surgical cleanup pass for Command Center + Inbox.

&nbsp;

Do not add new tables, migrations, AI calls, routes, major features, or architecture changes.

&nbsp;

Documents, Contract Intelligence, Export template polish, OpenCanvas Phase 2, theme customizer, and any rebuild of Command Center are explicitly out of scope.

&nbsp;

Goal: make Vanta feel calmer, clearer, more human, and easier to scan on mobile without changing the product’s core behavior.

&nbsp;

1. Plain-English Language Pass

&nbsp;

Centralize all user-facing event/status language so copy does not drift across the app.

&nbsp;

Update:

&nbsp;

src/lib/plainLabels.ts

src/lib/bulletinLanguage.ts

&nbsp;

Add or extend a single humanizeEvent() formatter/map that covers all system-ish phrases and translates them into plain English.

&nbsp;

Required replacements:

&nbsp;

Briefing read → Brief was opened

Brief created → New brief created

Capture routed → Capture was organized

Telegram message in → New Telegram note came in

Connected to a project → Attached to a project

Open in memory → Open saved note

Entity graph → Connections

high confidence → Likely useful

Pending Sherlock review → Possible duplicate

Already saved to memory → Saved to memory

&nbsp;

Add a dev-only banned-token guard inside the formatter.

&nbsp;

If any banned token reaches the formatter in development, replace/strip it and console.warn once.

&nbsp;

Silence warnings in production.

&nbsp;

Banned examples include:

&nbsp;

record inserted

signal detected

lifecycle state

briefing.viewed

briefing.composed

webhook received

suggest:message

extract:message

&nbsp;

Rewrite Daily Bulletin top-line composer so summaries are short, natural, and human.

&nbsp;

Rules:

&nbsp;

No robotic event names.

No “and a few more.”

Use compact counts when needed.

Prefer one short sentence over long stitched summaries.

&nbsp;

Today card subtitle must become:

&nbsp;

“Your quick check-in for today.”

&nbsp;

Inbox empty/unattached copy must become:

&nbsp;

“Not connected yet. Attach this so Vanta knows where it belongs.”

&nbsp;

All user-facing event/status copy must go through humanizeEvent() or existing plain label helpers. Do not add new inline system/status strings directly inside components.

&nbsp;

Relevant areas:

&nbsp;

cockpit

inbox

bulletin

today components

&nbsp;

2. Shared Collapsible + More Primitives

&nbsp;

Create two small shared UI primitives.

&nbsp;

File:

&nbsp;

src/components/ui/CollapsibleSection.tsx

&nbsp;

Requirements:

&nbsp;

Header with title.

Optional count chip.

Optional short summary phrase.

Smooth accordion open/close.

Motion duration between 200–300ms.

Use ease-out.

Support defaultOpen prop.

Respect prefers-reduced-motion.

If framer-motion already exists, use it carefully.

If not, use pure CSS transitions.

Do not add new dependencies.

&nbsp;

File:

&nbsp;

src/components/ui/CardMoreMenu.tsx

&nbsp;

Requirements:

&nbsp;

Thin wrapper over the existing dropdown/menu pattern.

Used for secondary card actions.

Keeps inbox/cockpit card menus consistent.

Do not invent a new menu system.

&nbsp;

3. Command Center / Cockpit Collapsibility

&nbsp;

Apply CollapsibleSection to:

&nbsp;

DailyBulletinCard.tsx

DailyChecklistCard.tsx

OperationsBriefingPanel.tsx

ProductivityPulseCard.tsx

ProjectRollupCards.tsx

system-ish tiles in src/pages/Index.tsx

&nbsp;

Open by default:

&nbsp;

Daily Bulletin

Needs you, only if count > 0

Today / Next move, only if there is an active item

&nbsp;

Collapsed by default, but still show count + short plain-English phrase:

&nbsp;

New captures

Done and saved

Quiet cleanup

Receipts

Memory Pulse

Connected sources

System details

Dismissed / stale

&nbsp;

Projects card:

&nbsp;

Show only the 2–3 most relevant projects.

Keep existing CALM language.

Do not expand this into a new project dashboard.

&nbsp;

Today empty state:

&nbsp;

If there are no urgent items, show a calm empty state.

Do not make the user feel like something is broken or missing.

&nbsp;

4. Inbox Card Redesign

&nbsp;

Update:

&nbsp;

InboxNotesList.tsx

&nbsp;

Each card should be reduced to:

&nbsp;

Title or preview

Source chips

Short status line

One primary action

One secondary action

More menu

&nbsp;

Primary action rules:

&nbsp;

Not attached → Attach to project

Likely project known → Attach to [Project Name]

Already attached → Open project

Needs review → Review

Saved and done → Collapse or Open saved note

&nbsp;

Move these actions into More:

&nbsp;

Connect person/place

Open saved note

View source

Show receipt

Advanced connection actions

&nbsp;

Replace the existing +person / +project / +place button row with a single Attach sheet trigger.

&nbsp;

Use:

&nbsp;

Saved

In memory

&nbsp;

Do not use arrow-to-memory chips.

&nbsp;

Max two visible actions per card.

&nbsp;

5. Calm Motion Layer

&nbsp;

Add small motion primitives using CSS variables in index.css.

&nbsp;

Add:

&nbsp;

--motion-fast: 160ms;

--motion-base: 220ms;

--motion-slow: 280ms;

&nbsp;

Use these consistently.

&nbsp;

Motion rules:

&nbsp;

Bulletin load: fade-in, sections settle in 180–240ms.

Accordion expand/collapse: 200–300ms ease-out.

Attach: card settles into “Attached to [Project]” confirmation.

Dismiss: slide-left/fade, then toast “Hidden from Command Center.”

Export saved: checkmark pulse, then plain-English toast.

Bottom nav active icon: subtle lift/glow.

Needs-you alert: gentle one-time glow only. No looping animation.

&nbsp;

Respect prefers-reduced-motion:

&nbsp;

Replace slides with fades or instant state changes.

No loops.

No unnecessary movement.

&nbsp;

Do not add animation libraries. Only use framer-motion if already installed.

&nbsp;

6. Aesthetic Micro-Polish

&nbsp;

Do not change the theme.

&nbsp;

Improve spacing in dense chip rows.

Use soft dividers instead of heavy boxes where appropriate.

Ensure tap targets are at least 44px.

Ensure no horizontal chip scrolling on 384–390px wide screens.

Keep mobile layout clean.

Max two visible actions per card.

&nbsp;

7. Preserve Existing Behavior

&nbsp;

Do not regress:

&nbsp;

Daily Bulletin position

Slice 5 exports

Slice 6 intake lifecycle

dismissed/stale persistence

grouped captures

attach-to-project

receipt internal completeness

Documents Beta page and banner

existing Command Center structure

existing routes

existing AI behavior

&nbsp;

No new AI calls.

No new database tables.

No new migrations.

No route changes.

&nbsp;

8. Acceptance Check

&nbsp;

After implementation, run the manual test script at 384–390px width.

&nbsp;

Confirm:

&nbsp;

Daily Bulletin appears first.

Top summary is short and human.

No banned system tokens are visible.

Non-urgent sections are collapsed by default with counts.

Inbox cards show one primary action and one secondary action max.

More menu contains advanced/secondary actions.

Attach flow confirms in plain English.

Dismiss flow shows “Hidden from Command Center.”

Reduced-motion mode replaces slides with fades or instant changes.

No horizontal chip scrolling.

Tap targets remain usable.

Documents/Export work was not touched except preserved existing behavior.

&nbsp;

Final audit:

&nbsp;

Search the UI-facing code for banned tokens.

Any visible copy must route through humanizeEvent() or plain label helpers.

Zero banned tokens should appear in rendered user-facing UI.