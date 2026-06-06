&nbsp;

&nbsp;

# Vanta Clarity Audit + Onboarding Layer

No new major features. Goal: a new user understands the flow in under 2 minutes, a returning user can answer the 7 acceptance questions without thinking.

## Part 1 — Audit findings (where users get lost today)

**Capture → Memory**

- `MemorySurface` mixes Captures / Files / Recognize / Corrections / Privacy tabs. No single "Inbox" label. Fix: rename the default tab to **Inbox** with a one-line helper: "Where new captures land before they're routed."
- `CaptureToast` confirms a save but doesn't say *where it went* or *what it connected to*. Fix: append "Saved to Memory · linked to {entity}" + tap-through.

**Linking**

- `ManualLinkSheet` button label is "Link items" — unclear. Fix: **"Connect to…"** with subtext "Notes, commitments, reminders, projects."
- `EntityChips` / `LinkChips` show raw type tokens (`commitment`, `reminder`, `note`). Fix: friendly nouns ("Commitment", "Reminder", "Note") + icon.

**Rollups / Command Center**

- `ProjectRollupCards` headers say "Recent / Needs / Linked" — fine, but no "why this is here" hint. Fix: card footer micro-line "Pinned project · updates the Operational Briefing."
- `OperationsBriefingPanel` uses internal terms like "source grounding" and "verdict". Fix label map:
  - verdict → **What's going on**
  - what_changed → **Recent changes**
  - what_matters → **What needs you**
  - useful_connections → **Connected items**
  - source_grounding → **Why this appears here**
- Duplicate "Create brief" buttons (system-scope footer + per-card) — keep both but unify label & icon, and tooltip the system one as "Brief for everything across Vanta."

**Briefs / Exports**

- `BriefComposerSheet` format presets currently read as `operator/client/audit_packet/weekly_review/audio_script`. Fix labels:
  - operator → **For me (operator)**
  - client → **For a client**
  - audit_packet → **Audit packet**
  - weekly_review → **Weekly review**
  - audio_script → **Audio briefing**
- "Approve & Export" flow has no plain explanation of draft vs export. Fix: helper banner "Drafts stay private. Export saves a PDF you can share and re-download."
- `BriefExportsList` title was generic. Fix: **"Saved exports"** with subtext "Every PDF you've exported, with receipts."

**Receipts / Audit**

- `AuditSurface` shows raw event names (`brief.generated`, `entity.linked`). Fix: humanizer map (`brief.generated` → "Brief generated", `pdf.generated` → "PDF created", `*.executed` → "Action ran", etc.). Keep raw event in a tooltip for owners.

**Navigation**

- Surface tabs: Conversation, Memory, Schedule, Commitments, Actions, Sherlock, Audit, Awareness, Command. 9 tabs at 384px is too many. We do **not** remove surfaces in this pass, but we relabel the mental anchors in `SurfaceTabs` tooltips:
  - Memory → "Inbox & memory"
  - Command → "Command Center — everything rolls up here"
  - Audit → "Receipts"

## Part 2 — Mental-model labels (one source of truth)

New file `src/lib/plainLabels.ts` exporting:

```
INBOX, MEMORY, PROJECTS, COMMAND, BRIEFS, RECEIPTS
+ humanize(eventKey), formatLabel(typeKey), formatFormat(briefFormat)
```

All surfaces import from here so wording stays consistent.

## Part 3 — Onboarding / tutorial layer

New components:

- `src/components/tutorial/TutorialProvider.tsx` — context, step state, persisted in `user_preferences.tutorial_state` (already an existing prefs row — store `{ completed: bool, step: number, dismissed: bool }`).
- `src/components/tutorial/FirstRunWalkthrough.tsx` — full-screen mobile-first overlay (384px target), 6 slides:
  1. "Capture anything — voice, text, file. It lands in your **Inbox**."
  2. "Vanta links it to the right **Project** automatically. You can also tap **Connect to…**."
  3. "Your **Command Center** shows what's going on, what needs you, and what changed."
  4. "Tap **Create brief** to turn it into a shareable PDF or audio summary."
  5. "Every export is **saved** under the project — and every change leaves a **receipt**."
  6. "Want a guided tour with a real note? **Try the Ground Stay demo**."
  - Skip / Next / Back, dots indicator, no auto-advance.
- `src/components/tutorial/WhatIsThis.tsx` — tiny `(?)` chip that opens a popover with 1–2 sentence explanation. Mounted on:
  - Command Center header
  - ProjectRollupCards
  - OperationsBriefingPanel
  - ManualLinkSheet trigger
  - BriefComposerSheet header
  - BriefExportsList header
  - AuditSurface header
  - SherlockWatchtowerCard header
- `src/components/tutorial/GroundStayDemoFlow.tsx` — scripted 8-step coach-mark tour that highlights real DOM targets via `data-tour="..."` attributes and walks: capture → memory → link → rollup → briefing → create brief → export → receipt. Uses no fake data; nudges the user to perform each step, with "Do this for me" fallback only for the capture step (creates a demo note tagged `demo:ground-stay`).
- Settings entry: **"Replay tutorial"** in `Settings.tsx` (re-opens FirstRunWalkthrough; "Run guided demo" re-opens GroundStayDemoFlow).

## Part 4 — Small UI fixes that pay off

- `CommandCenterSurface`: add a one-line header "**Command Center** — everything rolls up here." Replace "Past briefs" → "Saved exports".
- `EntityDetailSheet`: rename tabs to plain English (Overview / Connected / Briefs / Receipts).
- `CaptureToast`: show destination + connected entity if known.
- All `formatDistanceToNow` usages already fine; no change.
- Add `data-tour` attributes to the elements the demo flow needs to highlight (non-visual).

## Part 5 — Out of scope (explicitly)

- No new tables, no new edge functions, no schema changes.
- No removal of existing surfaces — just relabeling and tooltipping.
- No TTS upgrade, no IDML, no auto-tour.

## Files to create

- `src/lib/plainLabels.ts`
- `src/components/tutorial/TutorialProvider.tsx`
- `src/components/tutorial/FirstRunWalkthrough.tsx`
- `src/components/tutorial/WhatIsThis.tsx`
- `src/components/tutorial/GroundStayDemoFlow.tsx`
- `src/components/tutorial/tutorialCopy.ts` (all strings in one place)

## Files to edit

- `src/App.tsx` — wrap with `TutorialProvider`, mount `FirstRunWalkthrough` + `GroundStayDemoFlow`.
- `src/components/surfaces/CommandCenterSurface.tsx` — header, label swaps, WhatIsThis chips, data-tour attrs, "Saved exports".
- `src/components/cockpit/OperationsBriefingPanel.tsx` — section header relabels, WhatIsThis chip.
- `src/components/cockpit/ProjectRollupCards.tsx` — footer hint, WhatIsThis chip, data-tour.
- `src/components/links/ManualLinkSheet.tsx` — "Connect to…" label + subtext.
- `src/components/surfaces/MemorySurface.tsx` — default tab renamed "Inbox" + helper line.
- `src/components/capture/CaptureToast.tsx` — destination + connected-to line.
- `src/components/briefs/BriefComposerSheet.tsx` — friendly format names, draft/export helper banner.
- `src/components/briefs/BriefExportsList.tsx` — "Saved exports" title + subtext.
- `src/components/surfaces/AuditSurface.tsx` — humanized event labels via `plainLabels`.
- `src/components/entities/EntityDetailSheet.tsx` — plain-English tab labels.
- `src/components/shell/SurfaceTabs.tsx` — tooltip relabels.
- `src/pages/Settings.tsx` — Replay tutorial + Run guided demo.

## Acceptance check (manual)

- New user lands → walkthrough shows in 6 taps, dismissible.
- Each named card has a `(?)` that explains itself in ≤2 sentences.
- No surface shows raw event/type tokens to non-owners.
- Settings → Replay tutorial works.
- Guided demo completes end-to-end with one demo note.

VANTA CLARITY PASS — SITUATIONS OVER OBJECTS

The onboarding audit is approved.

Before implementation begins, perform one additional clarity pass focused on helping users understand situations, not just objects.

Current state:

Vanta is becoming excellent at explaining:

- Notes
- Files
- Actions
- Commitments
- Projects
- Links
- Exports
- Receipts

However, users ultimately do not care about objects.

Users care about:

- What needs me?
- What changed?
- What is blocked?
- What is waiting?
- What is done?
- What should I do next?

Goal:

Make Vanta explain situations before it explains infrastructure.

Example:

Instead of:

Ground Stay  
12 notes  
4 commitments  
2 actions  
7 files

Prefer:

Ground Stay requires attention.

Reason:  
The payment flow remains unresolved.

Open items:

- Booking confirmation logic
- Deposit workflow review

Suggested next move:  
Review payment flow and approve implementation.

Principle:

Objects support situations.

Situations drive decisions.

The Command Center should prioritize situations.

New recommendations:

1. WHY AM I SEEING THIS?

Add a small expandable section to:

- Project cards
- Command Center summaries
- Operational Briefing items
- Sherlock findings

Label:

"Why am I seeing this?"

Example:

Why am I seeing this?

- 4 new notes were added this week
- 2 commitments are still open
- A recent payment-flow change was detected

This project is currently active.

2. SYSTEM MAP

Add a permanent help page available from Settings.

Title:

How Vanta Works

Keep it visual and simple.

Example:

Capture  
↓  
Inbox  
↓  
Project  
↓  
Command Center  
↓  
Brief  
↓  
Receipt

Each step should have a one-sentence explanation.

No technical terminology.

No architecture language.

No database language.

No AI terminology.

3. COMMAND CENTER PRIORITY MODE

Command Center should rank cards by urgency and relevance.

Prefer:

Needs attention  
Waiting  
Blocked  
Review required  
On track  
Completed recently

Avoid:

Raw counts first.

The user should see status before statistics.

4. PROJECT HEALTH

Add optional project health indicators.

Examples:

On Track  
Needs Review  
Waiting  
Blocked  
High Activity

Health should be derived from:

- overdue commitments
- unresolved Sherlock findings
- recent activity
- pending actions

Health should always include a plain-English explanation.

5. DAILY OPERATOR VIEW

Add a condensed mode for Command Center.

Answer only:

- What changed?
- What needs me?
- What should I review?
- What can wait?

This becomes the fastest way to understand the system.

6. TUTORIAL IMPROVEMENT

The Ground Stay demo remains approved.

Add one final slide:

"You now understand the entire Vanta flow."

Capture  
→ Inbox  
→ Project  
→ Command Center  
→ Brief  
→ Receipt

The goal is confidence.

A new user should be able to explain Vanta to another person after completing the demo.

Final principle:

Every screen should answer:

What is happening?  
Why is it happening?  
What should I do next?

If a screen cannot answer those questions, simplify it before adding more features.

End goal:

Vanta should feel less like software and more like an operations officer.

Not:

"Here are your objects."

But:

"Here's what's going on."