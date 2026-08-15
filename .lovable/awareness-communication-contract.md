# Vanta Awareness & Communication Contract

Doctrine for proactive awareness. Read this before adding any signal source,
raising any urgency, or opening any new channel.

## Pipeline (one direction, no shortcuts)

```text
adapter -> AwarenessSignal -> relevance -> urgency -> suppression
        -> bundling -> delivery recommendation -> at most ONE Today nudge
```

Every stage is pure and deterministic. Callers do the I/O. `evaluateAwareness()`
is the only entry point that decides whether Vanta says anything.

## What a signal is

- Grounded in real records (`sourceRefs` + an entity or project). Ungrounded
  candidates are dropped, never phrased.
- Scope-segmented: Personal (`organization_id: null`) and each workspace are
  separate situations, always.
- Carries plain English `summary`, `why`, `nextStep`. No scores in user copy.

Adapters normalize and stop. They never score, rank, or deliver.

## Relevance

Deterministic weights over impact, time sensitivity, change magnitude,
continuity, and user intent. Confidence multiplies — weak evidence can never be
argued up. No AI decides whether the user is interrupted; AI may only phrase
something already approved for surfacing.

## Urgency ladder

`background -> useful -> attention -> time_sensitive -> critical`

- Attention is the floor for Today.
- `time_sensitive` requires the clock to actually be against the user.
- `critical` is a whitelist condition, never a score threshold. Nothing in the
  current product qualifies. That is deliberate.

## Suppression (where most candidates die)

resolved, ungrounded, low confidence, duplicate, cooldown (3 days), acknowledged,
not important, snoozed, quiet hours, stale (21 days), attention budget,
below threshold.

The attention budget rises as Vanta speaks: the more it said in the last 24h, or
the more the user dismissed in the last 7 days, the higher the bar. A situation
that got materially worse can escape cooldown once — nothing else can.

## Bundling

Ordinary attention-level items on one project become one sentence. Unrelated
projects and anything time-sensitive or above stay separate. Only the leading
bundle surfaces; the rest stay queued, never dumped as a list.

## Delivery

Live channels this phase: `silent`, `today`. Nothing else. `phone`, `wearable`,
`voice`, and `ambient` exist as a documented seam with a `futureChannel`
recommendation and a `DeliveryContext` shape, and are unreachable in code.

## Shadow mode

Every evaluation writes an `awareness.evaluated` audit event with the full
per-candidate record (factors, urgency, suppression reason, bundle, channel).
With `preferences.awareness_shadow_mode = true`, or `{ "shadow": true }` in the
sweep request, nothing user-visible is written at all. Tune thresholds from the
log, not from guesses.

## Invariants

1. At most one proactive nudge per user per scope per run.
2. Nudges are drafts. Plan -> Approve -> Execute never moves from here.
3. Quiet hours hold; they do not queue a backlog to dump later.
4. Dismiss sticks. "Not important" sticks harder.
5. No new tabs, no new nudge tables, no second awareness system.
