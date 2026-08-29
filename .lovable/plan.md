# Work comprehension pass

Five changes, all presentation and copy. No new room, no new store, no autonomous behaviour, nothing executes.

## 1. Quick actions on every desk

Each desk tile gains a small "Do this" strip: the one or two things you can actually do at that desk, as taps that open the desk in the right state (Inbox → route the oldest arrival, Commitments → record a promise, Actions → review what is waiting, Projects → start a project). When the desk is empty, the strip is replaced by the one-line reason it is empty plus the single tap that would fill it.

Wording is verb-first: "Route what arrived", "Record a promise", "Review 2 waiting", "Start a project".

## 2. "What can I do here?" button

The existing "?" panel answers *what is this*. It gains a second, promoted section that answers *what can I do*:

```text
Your options       Route it to a project · Turn it into a promise · Discard it
Recommended next   Route the oldest arrival — it has been sitting 3 days
When you start     Opens Inbox. Nothing is filed until you pick a destination.
```

The recommended line uses only counts the Work room already loads. When there is nothing to recommend it says so instead of inventing a step.

## 3. Work demo mode — storyboard, no data

A "See how Work flows" control at the top of Work opens a replayable storyboard in the same pattern as the existing Follow-one-note demo: capture arrives → lands in Inbox → routed to a project → Vanta drafts an action → you approve → receipt written → it shows up in Today tomorrow.

Every panel is drawn copy, not real records. Nothing is written to the database, nothing is deleted afterwards, and the storyboard says plainly at the end: "None of that happened. Your desks are untouched."

## 4. Intake chooser — three paths

The first-run capture panel folds four doors into three, with the fastest path recommended:

```text
1  Type it here            always open        RECOMMENDED
2  Upload a file           always open
3  Send it from your phone Telegram linked / email address live / not set up yet
```

Path 3 shows the truth about which phone door is actually connected, and links to the setup screen when neither is. Keyboard flow: the three paths are a single focus ring — arrow keys move between them, Enter opens the chosen path, and the recommended path holds initial focus.

## 5. "Where Vanta looks" — obvious by default

The third tier keeps its own collapse state, and:

- It auto-expands the first time you have anything on the intake side (a capture, a project, or a promise exists), because that is the moment reading rooms start to mean something.
- It always shows a one-line explanation above the tiles: "These read what you already captured and draft suggestions. Nothing here acts on its own."
- A visible "Hide" / "Show reading rooms" control with a count, so collapsing is obvious and remembered per device.

## Technical notes

- `src/lib/deskRoles.ts` — add `options: string[]`, `onStart: string`, and a `quickActions` list (label + target surface + optional intent) per desk. Copy only, no state.
- `src/components/work/DeskInfo.tsx` — new promoted "What can I do here?" block above the existing four lines; recommended step passed in as a prop from Work, derived from counts already fetched by `WorkSurface`.
- New `src/components/work/DeskQuickActions.tsx` — renders the strip on the tile; empty variant uses `role.emptyWhy`.
- New `src/components/work/WorkFlowDemo.tsx` — storyboard dialog modelled on `FollowOneNoteDemo.tsx`; pure copy, no queries.
- `src/components/memory/FirstRunCapture.tsx` — three paths, recommended flag, roving-tabindex keyboard handling; keeps the live email/Telegram readiness checks it already does.
- `src/components/surfaces/WorkSurface.tsx` — collapsible tier 3 via the existing persistent collapsible-section, auto-expand rule based on the counts it already has, plus the demo trigger in the header.
- Tests: extend `room-clarity`/`comprehension` tests to assert every desk has options, an on-start line, and at least one quick action, and that no quick-action label implies execution.
- Verify `tsgo --noEmit`, full Vitest, and the Work room at 384px.
