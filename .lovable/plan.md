# One body read, in both places

Your body gets the full read — heart, sleep, activity, steps, energy, weight and
BMI — on the Body desk and on Today, built from the same numbers and the same
motion as the flight strip and the day rail. No new room, no score, no verdict.

## What you'll see

**Today's body panel** (folded, as now) and the **Body desk** both carry the
same thing, the desk simply roomier:

1. **Today's line** — a moving marker along a time line, exactly the feel of the
   flight strip and the day rail: where today's readings actually landed on the
   clock, the newest one marked, now sitting where now is. A day with nothing
   sent shows the line and says nothing arrived rather than drawing a fake
   position.
2. **The fortnight underneath** — bar strips per day for heart, sleep, movement,
   steps and energy, with the same spacing, wrapping and motion polish the
   flight and calendar cards got. A day nothing arrived is an empty slot, never
   a bar at zero.
3. **Where you stand** — one row per number: newest reading, your own usual, and
   one plain sentence about the difference. Never "good", never "should".
4. **Weight and BMI** — weight with its movement, and BMI as plain arithmetic
   from your own weight and height, with how it has moved. **No category, no
   bands, no colour coding.** If height isn't filled in on the About-you card,
   it says BMI needs your height rather than guessing one.
5. **Sessions** — what was recorded in the last seven days, minutes and count.

Everything keeps the standing line: these are your numbers against your own
history, Echo says what changed and stops there.

## The rules this keeps

- Recorded readings only. A gap stays a gap; nothing is averaged into existence.
- No target, no score, no ring to close, no advice, no diagnosis.
- BMI is arithmetic Echo shows back, not a judgement it makes.
- Off means off: each group of readings stays behind its own switch, and a
  switched-off group shows as off rather than empty.
- Nothing here approves or runs anything, and nothing new is watched or sensed.

## What is deliberately not built

A Health room, tab or mode. A wellbeing score. Targets or streaks. Colour-coded
"healthy ranges". Anything that reads a number as a verdict.

## Technical notes

- **Maths in one place.** All new sentences and series go into `src/lib/wearable.ts`
  beside `heartByDay` / `heartCompare` / `bodyCompare`: `energyByDay`,
  `weightSeries`, `bmiFrom(weight, heightCm)` returning `null` without a height,
  `bmiMove`, and `todayReadingMarkers` (clock position per reading for the live
  line). `bodyCompare` gains `energy`, `weight` and `bmi` rows. No second
  calculator, so desk, Today, Ask and Telegram stay in agreement.
- **Motion and layout reuse.** The live line borrows `spreadMarkers` and
  `railWidthFor` from `src/lib/agendaBoard.ts` and the `MOTION_ARRIVE` /
  `MOTION_FLIP` vocabulary — same helpers the day rail uses, so labels never
  stack. New component `src/components/wearables/BodyLiveStrip.tsx`;
  `BodyPatternsPanel.tsx` grows the fortnight rows plus the stand/weight/BMI
  rows and keeps its `variant="desk" | "today"` sizing.
- **Height** reads from `profiles.preferences.body_profile.height_cm` (already
  on the About-you card). Absent height means BMI is stated as unavailable.
- **Readings** come from the existing `useWearableTrends` (14 days) with the
  realtime arrival subscription already in place, so a reading landing updates
  both places within a second.
- **Tests**: BMI with and without a height, BMI movement wording, energy and
  weight series with gaps, marker placement including a day with no readings,
  no-verdict wording assertions, plus 384px and 1440px checks on both surfaces.

## Order of work

1. Maths and sentences in `wearable.ts`, with tests.
2. `BodyLiveStrip` using the day-rail helpers.
3. `BodyPatternsPanel` grows the fortnight, stand/energy, weight and BMI rows.
4. Wire the full read into the Body desk and Today's panel.
5. Full suite, typecheck, phone and desktop pass.
