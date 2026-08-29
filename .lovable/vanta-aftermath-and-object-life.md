# Aftermath, object life, and confidence

Every important card answers four questions: what is this, what happened, what can I do, what happens if I tap.

## Card meta

`CardMeta` prints one line and no more: `Commitment · due Fri · opens Commitments`. Nouns come from `vantaNouns.ts`, so a second name for the same object cannot appear. A fourth fact belongs in the card body.

## Aftermath

`AftermathFooter` when the card needs a "Next:" affordance, `AftermathHint` when the card already has its own buttons. Both are copy — they never execute, never fetch.

Shown when state changed, something was created or filed, or the object moved:

```text
Filed to Lamai rollout · appears in Receipts
Marked Waiting On · shows in Work
Draft prepared · nothing has executed
```

Not shown on trivial taps (expanding a panel, switching a tab, opening a peek).

## Object life

`src/lib/objectLife.ts` + `ObjectLife`. One line, built only from recorded events:

```text
Captured from Telegram → filed to Lamai rollout → moved 3 times → due Fri
```

Rules:

- events come from real audit rows (`audit_log`, `action_events`); nothing is inferred
- repeats collapse ("moved 3 times"), they are not listed
- more than four steps keeps the origin plus the most recent moves and links out to Receipts
- no recorded events means "No recorded history yet." — never a fabricated story
- Receipts stays the full evidence layer; this is a summary

## Provenance

`ProvenanceChip` gives one source marker in plain words (From Telegram, Added by you). No connector ids, no payload keys, never two markers on one card.

## Confidence

`src/lib/confidence.ts` + `ReadNote`. A direct read looks ordinary; an inference reads as one.

```text
Read from calendar              direct read, certain
From Telegram                   direct read, certain
Likely related to Lamai rollout inference, 0.55–0.85
Uncertain — needs review        inference below 0.55, amber
```

Bands are coarse on purpose — a percentage is not a user-facing idea. Missing confidence is treated as uncertain, never rounded up. Uncertainty is on the card, never hidden in a tooltip.

## Undo truthfulness

Undo appears only where the engine can really reverse the work (`actions.rollback_available`). Where it cannot, the card says "This one cannot be undone. The receipt is the record.", and a not-yet-run action that is irreversible says so before execution. No fake undo, ever.
