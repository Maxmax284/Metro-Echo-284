# Wrist experience — the glance contract

The wrist answers exactly one question: **what deserves my attention right now?**

## The contract

- Zero or one card. Never a list.
- Silence is a valid, successful output: `Nothing needs you.`
- The card carries: one headline, at most one fact, a source, and a time.
- A proof line sits underneath: posture, connection freshness, body line.
- Controls, and only these: **Noted** · **Remind later** · **Open on phone**.
  **Mark done** appears only where a narrow existing lifecycle rule already allows it.
- One deliberate capture button.

## What the wrist never shows

Dashboards, long lists, charts as the main event, multi-paragraph answers, dense
settings, project management UI, anything approval-shaped.

## What the controls mean

| Control | Meaning | Not |
| --- | --- | --- |
| Noted | The notice was acknowledged. | Approval. Nothing was done to the object. |
| Remind later | The item stays open and comes back. | Dismissal. |
| Mark done | An existing narrow lifecycle transition, e.g. a promise you made. | A consequential action. |
| Open on phone | Continue in Vanta with the same object, scope and thread. | A new session. |

No consequential action can be approved or executed from the wrist. Approval does
not travel between bodies.

## Capture

1. The user deliberately starts a capture.
2. Text or voice becomes a draft.
3. Time, device source and provenance are attached.
4. It lands inside Vanta as a note awaiting review.
5. It does not execute and does not silently become a commitment.
6. If it reads like a promise, Vanta says so: `This sounds like a commitment. Review on phone?`

## Hand-off

Noted and Remind later write real events, so the phone can later say
`You deferred this from your wrist 18 minutes ago` against the same object, same
scope, same thread. No duplicate object is created.

## Where this lives

`/glance`, built from `src/lib/glance.ts` (selection, threshold, action set) and
`src/lib/deviceCompression.ts` (the wrist wording).
