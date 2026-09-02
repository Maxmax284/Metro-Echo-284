# Posture model

Posture describes the kind of moment the user is in. It does not describe the person,
and it never diagnoses anything.

## States

`at_desk` · `deep_work` · `meeting` · `training` · `driving` · `travel` · `moving` ·
`quiet` · `sleep`. Absent is a valid state: no posture set.

## Where a posture may come from

| Source | Allowed | Rule |
| --- | --- | --- |
| Manual | yes | The user picks it, optionally with an end time. Always wins. |
| Calendar | suggestion only | A meeting on the feed may suggest `meeting`. |
| Body signal | suggestion only | Sustained elevated heart rate plus a workout may suggest `training`. |
| Device motion | suggestion only | May suggest `moving`. |
| Place | opt-in, suggestion only | Requires explicit consent and a visible source. |

Automatic posture is **suggested, never silently applied**:

```
Looks like you're training. Quiet ordinary alerts?
   Yes · Not now · Always ask
```

The source is shown wherever the posture is shown (`manual`, `suggested`, `inferred`).

## What posture may change

Message length, interruption timing, bundling, whether Vanta waits, whether a haptic
replaces text, whether it offers a training-shaped suggestion.

## What posture may never change

Approval, execution, financial decisions, booking decisions, legal decisions, routing
without review, or what is factually true. Body data is context, not authority.

## Expiry

A manual posture may carry an end time. When it lapses, Vanta returns to no posture
rather than guessing a new one. Held ordinary notices are then released; anything
critical was never held.
