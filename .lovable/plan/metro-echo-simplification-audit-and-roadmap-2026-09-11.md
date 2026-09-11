# Metro Echo — simplification audit and roadmap

## The verdict (short version)

The engine is done. The dashboard has too many gauges.

Metro Echo has one brain, one action spine, one approval state, one receipt trail. That part is genuinely rare. What it does not have is restraint on the glass. Right now Work greets you with a numbered three-tier lecture, two shelves, ten desks, a demo player, a physical-loop panel and a body line — before you have done anything. Today runs fifteen-plus mounted components with Expand all / Collapse all buttons, which is the universal sign that a screen has more sections than a screen should have.

Plain read: it stopped being a pile of features and became a companion that still dresses like a department. The fix is presentation and vocabulary, not plumbing.

## Grounded findings

- Four rooms are real in code (`src/lib/navigation.ts`) and ten desks are correctly demoted to `ADVANCED_SURFACES`. The law holds. Good.
- `WorkSurface.tsx` (473 lines) renders: "Where things stand" briefing, `TierHeading` 1/2/3, "Where work lands" (7 desk tiles), "Where Echo looks" (Memory, Sherlock, Awareness), `WeekAgenda`, `ResumeWorkSection`, `PhysicalLoopPanel`, `WorkBodyLine`, `WorkFlowDemo`, `GotSomethingChooser`, `SurfaceAftermath`. That is 11 top-level objects competing at similar weight.
- Empty desks still render: `Desk` computes `isEmpty` but keeps the tile, plus copy like "No drafts waiting. Nothing can run without your approval anyway." Teaching text is good doctrine; on every empty tile at once it is noise.
- `CommandCenterSurface.tsx` is 807 lines and reachable as the `command` desk — the largest single surface in the app and conceptually a second Today.
- `TodaySurface.tsx` (1018 lines) mounts ~20 section components with per-section sheets, plus explicit Expand all / Collapse all controls.
- Backend vocabulary is on the glass: desk labels "Actions", "Commitments", "Briefs", "Memory", "Sherlock", "Awareness", "Inbox"; Today labels "Fresh in", "Receipts", "Route the 3 arrivals", "drafts waiting on your approval".
- Interaction verbs are not standardized: **Dismiss ×157**, Archive ×88, Delete ×48, Snooze ×41, Remove ×31, Ignore ×23, "Clear settled" ×1, "Stop it" ×1 across `src/components`. Six words for roughly three meanings.
- Museum routes exist: `/how`, `/glance`, `/watch`, `/motion` (redirect), `/wearables` (redirect), `/wearable-loop`, `/physical-loop`, `/awareness/location`, `/documents`, `/projects` + `/projects/:id` duplicating in-shell desks.

## 1) Work — the biggest target

Three shelves, stable order, dynamic contents:

**Coming in** — Inbox, Schedule, new captures, files, messages.
**In motion** — Projects, open promises, waiting-on-you drafts, briefs as outputs.
**Echo noticed** — Sherlock findings, contradictions, patterns, memory-worthy context.

| Desk / element | Call |
|---|---|
| Projects | Keep, under In motion, first |
| Inbox | Keep, under Coming in, rename **Just arrived** |
| Schedule | Keep, under Coming in |
| Commitments | Keep only when non-zero; rename **Promises** |
| Actions | Keep capability, rename **Waiting on you**; drop the technical branding |
| Briefs | Merge — an output inside a project, not a desk |
| Documents | Keep as a route; remove from the desk grid |
| Memory | Move deeper — surfaces contextually; becomes search, not a filing cabinet |
| Sherlock | Rename to the shelf itself: **Echo noticed** |
| Awareness | Move deeper; keep as the place desk, feeds context everywhere |
| Command / Cockpit | Retire from navigation; it is a second Today |
| TierHeading 1/2/3 | Retire — nobody needs a numbered tour of a room they live in |
| WorkFlowDemo | Move into first-run only |
| PhysicalLoopPanel, WorkBodyLine | Move deeper; render only with real recent data |
| Empty desks | Hide, or collapse into one quiet line: "Nothing in Promises or Briefs right now." |

## 2) Today — front door language pass

Sections, rendered only when they have something: **Current read · Needs you · Coming up · Changed.** Everything else folds under those four or under "Why this?".

Copy direction, using current strings:

| Now | Street terms |
|---|---|
| "Fresh in" | "Just landed" |
| "Route the 3 arrivals sitting unsorted." | "3 new things came in. Want them filed?" |
| "Review the 3 drafts waiting on your approval." | "3 things are waiting on your yes." |
| "No dated promises" | "Nothing you promised has a date on it." |
| "Nothing recorded yet. Every save, approval and run leaves a receipt here." | "Nothing's happened yet today." |
| "Reading this space…" | "One sec — checking your day." |
| "Cross-device resume" | "Pick up where you left off." |
| "Happening now / True as of this minute" | "Right now" |
| "Couldn't read recent activity" | "Couldn't check what changed. Try again." |
| Expand all / Collapse all | Delete both. Fix the section count instead. |

Rules to enforce: one sentence, one conclusion; one situation, one card; never lead with the object ("Calendar event modified") always lead with the meaning ("Your appointment moved"); a calm day gets to look calm — headline plus one line and nothing else.

## 3) Location / Awareness

- Today shows place **only when it changes the answer**: distance to the next thing, a real move between cities, weather that hits your departure, a fix gone stale ("Last place check was about 2 hours ago").
- No standing place card. `PlaceCueStrip` collapses to one sentence, expandable.
- The deeper Awareness desk keeps map, current fix, freshness, precision, saved places, drag-to-correct, nearby, trip history, "what Echo can see".
- Saved Places stays four verbs: save, rename, archive, delete. No place-management center.

## 4) One interaction vocabulary

Standardize and eliminate the rest:

- **Not now** — stop surfacing this kind of thing for a while (replaces most "Ignore")
- **Later** — stays true, comes back (replaces "Snooze")
- **Handled** — I did it in the real world
- **Hide** — off this view, source truth untouched (replaces most "Dismiss" and "Remove")
- **Archive** — kept, out of active work
- **Delete** — actually gone, user-authored content only
- **Clear settled** — bulk-hide already-resolved items

157 "Dismiss" buttons currently mean at least three different things. That is the single most confusing thing in the product.

## 5) Visual pass

Cut one nesting level everywhere (`vanta-card` inside `section` inside `CollapsibleSection`). Fewer borders, fewer headers, fewer explanatory paragraphs on screen at once — that text moves into "Why this?". One primary action per screen. Validate every change at 384px: if one thumb-swipe does not tell you what the screen is about, it is still too busy.

## 6) Ask / widget / Telegram

Already one Echo underneath. Remaining work is dead ends: fewer "Open Metro Echo" hand-offs for things Ask can do inline, grounded suggested questions derived from current state instead of generic prompts, and inline contextual verbs — "Move that", "Why is this here?", "Add that to the project", "What changed?".

## 7) Receipts

Front layer becomes six human lines: what happened · what Echo did · what you approved · what failed · what Echo held back · what changed outside Echo. Raw audit rows move one level deeper behind "Show the record".

## 8) Navigation cleanup

Remove from navigation (capability can stay reachable): `command`/Cockpit, `/glance`, `/motion`, `/wearables`, `/how`. Fold `/watch` + `/wearable-loop` + `/physical-loop` into one deeper desk. Keep `/projects` routes but stop duplicating chrome with the in-shell desk.

## 9) Roadmap

**Quick wins (low risk, high relief)**
1. One interaction vocabulary; retire "Dismiss".
2. Today copy pass + delete Expand all / Collapse all.
3. Hide empty desks and empty Today sections.
4. Drop `TierHeading` 1/2/3 from Work.
5. Pull museum routes out of navigation.

**Deeper refactors**
6. Rebuild Work as three shelves (Coming in / In motion / Echo noticed).
7. Retire Cockpit; absorb anything genuinely unique into Today.
8. Briefs become project outputs; Memory becomes contextual search.
9. Receipts front layer.
10. Location-only-when-it-matters.

## 10) Do not touch — this already fits

Four-room law and `navigation.ts`. The action spine, approval state and receipts. Capture never executes. `workBriefing.ts` "Start here" returning exactly one promoted tap. Silence as a valid output. Shared calendar read/write path across app and Telegram. Provenance and "Why this?". Scope filtering. `vantaVoice` as the single voice funnel.

Nothing here changes schema, routes or capability. It is a presentation and vocabulary pass.
