# Awareness underneath Today — audit and blended architecture

Planning only. No code changes in this pass.

Principle under test: **Today should not contain Awareness. Today should behave as if Awareness is underneath it.**

Verdict up front: the architecture already agrees with you. The four-room law is intact, Aware is already parented to Work, and the shared situation reader already treats place as a *clause*, not a card. What is actually wrong is narrower than a redesign: the Aware room is reachable like a destination, a few Today blocks read place independently, and nothing on Today bundles place + meeting + weather + travel into one notice. That is a wiring and copy pass, not a new layer.

---

## A. What Today actually contains now

`src/components/surfaces/TodaySurface.tsx` (830 lines), mounted by `src/pages/Index.tsx:277` when `surface === "today"`. One scrolling column, in render order:

1. Hero header (`:338-429`) — room label, scope badge, expand/collapse-all, `ExplainThisButton`, headline, day line, `TimeSourceLine`, `TimezoneFollowPrompt`, and `SituationRead` (`src/components/today/SituationRead.tsx`).
2. `SourceHealthStrip` (`:433`) — `useSourceHealth()`.
3. `AskVantaBar` (`:437`).
4. `TickRow` (`:441`) — registration marks, `live={changeSignal}`.
5. `CrossDeviceResume` (`:444`).
6. `FieldSessionCard variant="today"` (`:447`) — active trip.
7. `EveningReadCard` (`:450`) — calendar + forecast, already bundled.
8. `ResumeWorkSection` (`:453`).
9. `NoticedRow` (`:457`) — the single proactive-awareness voice.
10. Secondary strip: `GotSomethingChooser`, `FirstLapCard`, `Section "Find it fast"` (`JumpStrip`, `TodayDigestLine`, `QuickModes`).
11. `TodayBodyPanel`, then `Section "Needs attention"`, `"What's next"`, `"Security"`, `"What changed"`, `"Fresh in"`.
12. `SurfaceAftermath`, `TodaySectionSheet` drill-down.

Data: `useTodayDigest` (master), `useSituation(digest)`, `useSourceHealth`, `useLiveFeed`, `useAgenda`, `useWearableLoop`, `useUserTimezone`, `useScope`. Shell-level: `useShellWeather()` in `Index.tsx:107` and `useAwareness()` in `Index.tsx:110` (header badge only).

Motion already in place (`src/lib/motion.ts`, keyframes in `src/index.css`): `MOTION_BOOT` staggered entry, `MOTION_ARRIVE` (live lands), `MOTION_STAMP` (history settles), `MOTION_COMMIT`, `MOTION_SIGNAL` (one-shot noticed sweep), `MOTION_TIME_LOCK`, `LEAD_BAR`, `feelK()`/`feelMs()` scaling. Doctrine is documented at `motion.ts:22-33` and `.lovable/vanta-clarity-motion-system.md`.

Collapse: `CollapsibleSection` persists per-panel state in `localStorage`, sweeps via a `vanta:panels-set` event, and `openSection` (`:284-293`) opens exactly one section by default.

## B. What the Aware room contains now, and what is worth keeping

`src/components/surfaces/AwarenessSurface.tsx` (744 lines). Not a route — a surface reached via `?surface=awareness`, already parented to Work in `src/lib/navigation.ts:50` and hidden in the More sheet in `SurfaceTabs.tsx`. Only `/awareness/location` (`LocationSetup`) is a real route.

Worth preserving as a desk:
- One honest place sentence + source badge + accuracy (`placeTruth`, `placeSourceBadge`, `accuracyMetres`).
- `readShelves` → paragraph plus four shelves: Now / Around you / Changed / Coming up (`src/lib/awarenessShelves.ts`).
- `AwarenessMapPanel` / `AwarenessMap` (drag-to-fix), `MapPickerDialog`, `BadLocationRecoveryPanel` + nearby-place alternatives.
- Saved-place list and switching, `SourceStatusPill`, `WhatVantaSees`.
- Explicit tier-aware Scan button (`refreshSnapshot(true)`) — never auto-fires.
- New-country notice offering a fresh read.
- `FieldSessionCard variant="aware"`, `ArrivalsLane`.
- Behind "Show the workings": radar HUD, layer chips, layer drawers.

Genuinely duplicated on Today today: `FieldSessionCard` (both), `ArrivalsLane` data (arrivals also reach Today via the situation read), and place text (Today's `placeNote`, the header place label, the Aware paragraph).

## C. What would be redundant, noisy or dangerous to merge

- A "Where" card on Today. That is the thing to avoid, not build.
- Weather, Nearby, Trip, Location, Awareness as five independent Today modules — five cards saying one thing.
- The radar HUD, layer chips and terrain on Today. They are workings, not answers, and already hidden behind a toggle in their own room.
- Saved-place management, drag-to-fix, permissions and precision controls on Today. Editing is desk work.
- A Today-side scan trigger. Scanning must stay one explicit tap in one place.
- Any second nudge path. `NoticedRow` fed by the awareness pipeline is the only proactive voice; a "location changed" banner outside it becomes a second notification system.
- Continuous position animation, live trails, background fixes. Already parked in `roadmap.md`.
- Aware as a fifth tab. It is already not one; do not promote it.

## D. Recommended blended Today architecture

Three moves, no new modules.

**1. Place becomes a clause, everywhere it appears.** `_shared/situation.ts` already owns this: `SituationPlace`, `placeSpeaks()` (place only speaks when resolved, fresh within 12h, and there is a line for it to sit beside), `placeNoteFor()`, and `elsewhereMeetings` (a meeting somewhere you are not never makes the main read). Today renders `placeNote` at `SituationRead.tsx:107`. Keep that as the load-bearing rule and route all other Today place mentions through it.

**2. One compact context strip, only when place matters.** A light `HERE · Chantilly` line in the hero region — one row, no card chrome, muted, tappable. It shows only when `placeSpeaks()` is true or a real transition just happened (country change, timezone drift, active trip). Otherwise absent, not empty. Tapping opens the Aware desk. It reuses `placeTruth` / `TimeSourceLine`'s honesty vocabulary; it never claims precision the fix did not earn.

**3. Existing Today items absorb place.** No new sections. The situation read's meeting line gains travel/weather context; `EveningReadCard` already fuses calendar + forecast + place and is the proven pattern; `FieldSessionCard` stays the trip voice; `NoticedRow` stays the only proactive voice and gains place-shaped signals through the existing awareness pipeline rather than a new one.

Bundling (your example) becomes one situation line with a reveal, not four cards:

```text
HERE · Chantilly
Physio at 4:30 in Fairfax — about 25 min out, rain starts around 4.
  Why this? · calendar + your fix + forecast, read 6 min ago
```

## E. Visual and motion concepts that fit what exists

Reuse the vocabulary in `src/lib/motion.ts`; add no new keyframe families.

| Event | Treatment | Existing class |
| --- | --- | --- |
| New place resolved, real move | strip lands once from the left, then still | `MOTION_ARRIVE` |
| Place value replaced (city → city) | single flip of the strip's text only | one small flip, reusing `flip.ts` timing |
| Related facts threading into one notice | lead rail draws down the bundled line once | `LEAD_BAR` |
| Something completed / trip ended | presses in and settles, then clears | `MOTION_STAMP` |
| Stale place | opacity drop, no motion | static |
| Needs attention | one controlled sweep, then still | `MOTION_SIGNAL` |
| Severe state | strip simplifies to one sentence, motion removed | none |
| Position, weather, radar | never animate | none |

Bulletin-board language, elegant end only: the strip reads as a small tape label above the read; a bundled notice gets one hairline route rail on its left; a completed item gets the existing stamp. No pins, no scatter, no rotation, no graffiti on data — paint stays still per the identity rules.

## F. How place attaches instead of spawning cards

- Meeting line: append travel and weather to the sentence already produced by the situation reader. One line, one reveal.
- Commitments: place only softens wording; it never changes a due time. Already the stated rule in `situation.ts`.
- Arrivals: keep the existing arrival read; add "arrived while you were in X" only inside the reveal.
- Trip: `FieldSessionCard` is the trip's only Today voice.
- Elsewhere meetings: stay off Today, on the Aware "Around you" shelf. Already implemented.
- Nearby venues: never on Today. They are the desk's answer to "what's around me".

## G. What stays a deeper desk

The Aware surface remains under Work, unchanged in scope: map and drag-to-fix, saved places and switching, precision and freshness, tier and scan, nearby places, layer briefings and the radar workings, bad-pin recovery, `WhatVantaSees`, trip history. Reachable from the strip, from the situation read's `noticed` target, from the header badge and from More. Not a tab.

## H. Already built — reuse, do not rebuild

- `supabase/functions/_shared/situation.ts` — `placeSpeaks`, `placeNoteFor`, `elsewhereMeetings`, ranked three-line read.
- `src/lib/awarenessShelves.ts` — shelf model, `agoPhrase`, `cleanScanSummary`.
- `src/lib/placeTruth.ts` / `honestContext.ts` / `awarenessLocation.ts` / `locationSanity.ts` / `placeMove.ts` — precision, provenance, move detection.
- `src/lib/eveningRead.ts` + `EveningReadCard` — the bundling precedent.
- `supabase/functions/_shared/awareness/*` — the one decision path for relevance, urgency, suppression, bundling, delivery. Anything proactive goes through it.
- `src/lib/motion.ts`, `flip.ts`, `src/index.css` keyframes, `feelK()`.
- `AwarenessProvider`, `useSituation`, `useTrips`, `useFieldSession`, `useShellWeather`.

## I. Phases, lowest risk first

1. **Truth pass, no visual change.** Route every Today place mention through `placeSpeaks`/`placeNoteFor`. Remove any place text that bypasses it. Tests only.
2. **Context strip.** Add the compact `HERE · <place>` line with strict show conditions and one arrival animation. Absent when quiet.
3. **Bundling.** Teach the situation reader's meeting line to carry travel time and weather impact as one sentence plus reveal. Pure-module change with tests; no new card.
4. **De-duplicate.** Ensure trip, arrivals and place each speak once on Today. Confirm nearby venues and scan stay desk-only.
5. **Motion polish.** Flip on place change, rail on bundled notices, stamp-then-clear on completion, severe-state simplification.
6. **Desk tidy.** Confirm Aware is only reachable as a Work desk; make the strip its main entrance.

## J. Acceptance criteria

At 384px:
- Quiet day: no strip, no place words, no empty location card. Today is spacious.
- Strip is one line, tap target at least 44px tall, never wraps to three lines.
- A bundled notice is one card with one reveal, not four cards.
- Hierarchy comes from size, weight and spacing — no meaning carried only by 10px text.
- No motion loops. At most one animation per real change. `prefers-reduced-motion` removes all of it.

Desktop:
- The strip stays light and does not become a dashboard row.
- The Aware desk is unchanged and complete.

Both:
- Place never invents precision; a device guess is always labelled.
- No new notification path; `NoticedRow` remains the only proactive voice.
- Four rooms, four tabs.

## K. Smoke-test risk

The in-progress certification (`.lovable/plan/metro-echo-release-grade-smoke-test-2026-09-06.md`) explicitly tests Today cold (step 1), the trip agreeing across Today and the local room (step 6), and Today re-read at the end (step 10). Risks and mitigations:

- **Step 1 and 10 baselines shift** if Today's visible composition changes mid-run. Mitigation: land phase 1 (invisible truth pass) any time; hold phases 2, 3 and 5 until the current golden path run is captured, or re-capture the cold Today screenshot after phase 2.
- **Step 6 (trip across surfaces)** touches `FieldSessionCard` on both surfaces. Do not move or restyle it during phase 4; only assert it appears once per surface.
- **Suppression/held-back evidence** must not gain a second path. Phase 3 changes wording inside the existing read, not delivery.
- **Receipt chain** is untouched — none of this writes state.
- **Test suite** (768 passing) covers `situation`, `place-truth`, `place-move`, `awareness-shelves`, `evening-read`, `today-digest`, `room-clarity`, `navigation`. Every phase must keep them green, and phases 1 and 3 should add cases rather than relax existing ones.

## Technical notes

- No new tables, no new edge functions, no new provider. The strip reads `useAwareness()` and `useSituation()` state that Today's tree already has.
- Travel time: use existing place + meeting location data only. If a distance cannot be derived from what is already recorded, the sentence omits it rather than estimating.
- Frozen identifiers stay frozen (`vanta-*` classes, `vanta.` localStorage keys, `vanta_*` columns) per `roadmap.md`.
- Anything proactive routes through `supabase/functions/_shared/awareness/*`. No second decision path.
