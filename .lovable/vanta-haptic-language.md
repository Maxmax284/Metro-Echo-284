# Haptic language — four patterns, nothing more

Nobody should have to learn Morse code to use Vanta.

| Pattern | Buzz | Meaning | Urgency ceiling |
| --- | --- | --- | --- |
| Note | one short pulse | For your information. Nothing is waiting on you. | fyi |
| Change | two short pulses | Something meaningful changed. | meaningful |
| Needs you | one longer pulse | Something is waiting on you. | needs_you |
| Critical | long · short · long | A hard, explicitly defined critical condition. | critical |

## Suppression

- Quiet hours silence Note, Change and Needs you. Only Critical passes.
- A posture that holds noise (deep work, training, driving, meeting, quiet, sleep)
  silences Note and Change; Needs you waits for the posture to end unless the item
  has its own hard deadline.
- Already acknowledged, or surfaced in the last twenty minutes: no buzz.
- Attention budget spent: only Critical.
- Sleep posture: nothing but Critical, ever.

## Critical means critical

Critical requires a hard, explicit condition — a user-defined deadline breach or an
event already marked critical by product policy. High heart rate, a missed step
goal, an unread message and a stale project are never critical on their own.

## Accessibility

- The haptic is an addition to the on-screen line, never a replacement for it.
  Every buzz has a matching card the user can read at their own pace.
- Reduced motion does not disable haptics — a buzz is quieter than an animation.
  It disables the card's movement, not its arrival.
- Where vibration is unavailable, the visual state change alone is the notice, and
  nothing is lost.

## Where this lives

`src/lib/haptics.ts`. Patterns, urgency mapping, and one `allowHaptic` gate all
callers pass through.
