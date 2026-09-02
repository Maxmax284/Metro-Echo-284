# Earbud / voice experience — architecture, not yet built

Deliberate only. No continuous listening. No wake-on-everything.

## The shape of an exchange

```
User:  Vanta.
User:  What changed while I was training?
Vanta: One booking moved and Nikki replied. Nothing urgent.
```

```
User:  Remember this: ask Ralph about Saturday.
Vanta: Captured.
```

## Spoken forms of each block

| Block | Spoken |
| --- | --- |
| Research | "Bottom line first." then one sentence. |
| Receipt | "Done. A receipt was written." |
| Waiting | "Still waiting on Nikki. No change." |
| Sherlock finding | "One unusual pattern. Open it when you're free." |
| Action prepared | "A step is prepared. Review it on your phone." |
| Nothing | "Nothing needs you." |

## Rules

- Short, plain, interruptible, source-grounded, non-performative.
- No long monologues. No personality chatter. No filler insight.
- Structured answers are never read verbatim; the ear gets the bottom line and an
  offer of the rest.
- Approval is never spoken into existence. Voice can capture, acknowledge, defer,
  and ask — nothing else.
- Driving posture is voice-first and approval-free by rule.

## Seam

`verbosityForChannel("voice")` → `spoken` already exists in `awareness/compress.ts`,
and `deviceCompression.renderForms()` produces the spoken form today. What is missing
is only the transport: wake handling, capture routing, and playback.
