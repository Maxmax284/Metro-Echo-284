# Ambient intelligence rules — Vanta earns interruptions

Smaller surface, stronger filtering. A wrist notice must clear a higher bar than a
Today card.

## The gate, in order

1. **Consent** — is the signal family switched on at all?
2. **Urgency** — informational items never reach the wrist. Meaningful and above only.
3. **Relevance** — is it in the active scope and about something the user is holding?
4. **Posture** — a posture that holds noise passes only "needs you" and above.
5. **Already acknowledged** — Noted means gone from the wrist.
6. **Recently surfaced** — nothing repeats inside twenty minutes.
7. **Material change** — a second identical state is not news.
8. **Quiet hours** — critical only.
9. **Attention budget** — when spent, critical only.
10. **Device suitability** — approval-shaped items never render on a wrist; they
    render as "Open on phone".

Anything that fails the gate is not deleted — it stays in Today and in Receipts. It
simply did not deserve the wrist.

## Silence as output

`Nothing needs you.` is a success state. Vanta does not fill a watch face because
space exists, does not manufacture a daily insight, and does not generate filler.

## Critical gating

Ordinary scoring alone cannot produce critical. Critical requires an explicit hard
condition — a user-defined deadline breach, or an event already marked critical by
policy. Body signals never create critical.

## Where this lives

`src/lib/glance.ts` implements the gate as one pure function with a stated reason for
every decision, so "why did you stay quiet?" has a real answer in Receipts.
