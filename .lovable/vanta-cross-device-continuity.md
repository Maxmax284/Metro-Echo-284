# Cross-device continuity

One companion, several bodies. Start on the phone, continue at the desk, and Vanta already knows it is the same thread of work.

## Where it lives

`profiles.preferences.context` (`StoredContext` in `_shared/awareness/prefs.ts`). `VantaContextProvider` loads it, snapshots it as `arrival` before this device stamps itself on top, and persists only the travelling half.

## What carries

- active Ask thread (`threadId`)
- current project / object context (`projectId`, `sourceRefs`)
- the unresolved question
- last meaningful step (`lastStep`) and its label + surface (`lastAnchorLabel`, `lastAnchorSurface`)
- the scope that owns the anchor (`lastScopeKey`)
- posture and lens the user set by hand
- a pending action **id** — a pointer, never a permission

## What never carries

Listed in `NEVER_CARRIED` and stripped on every write: `deviceClass`, `moving`, `quietHours`, `earbudsPresent`, `wearablePresent`, `locationLabel`. Device-local facts stay on their device.

Also never: approval, cross-scope context, transient UI state.

## Scope behaviour

Every trace is stamped with the current scope key. `resumeNotice()` returns `null` unless the stored key matches the session's key exactly. An absent key never resumes. Personal work cannot surface inside a workspace, and the reverse.

## Approval behaviour

A pending approval travels as a pointer so the new device can show it. The yes still has to happen on the body in your hand, and the card says so:

> An approval is still open. You will have to say yes here — it does not travel with you.

## Resume logic

`CrossDeviceResume` on Today shows at most one line:

```text
You were on Lamai rollout 18 minutes ago on your phone.
Last step: reviewed booking drift.        [Resume]  [Dismiss]
```

Conditions, all required:

- scope matches
- gap is between 3 minutes and 12 hours
- the last body differs from the current body and is known
- there is a real anchor (project, thread, or label)
- quiet hours are off

Resume opens where you were. It never executes. Dismiss is remembered per hand-off (`vanta.resume.dismissed`), so the same hand-off never asks twice.

## Stale context rules

Past 12 hours the thread is cold: the resume line stays silent and Work's briefing plus Receipts carry the continuity instead. Old context is noise, not help.
