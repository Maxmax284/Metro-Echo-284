# Vanta next lap — audit

State at the start of this lap, read from the codebase and the live database.

## What already held
- Four rooms only. No fifth room, no second chat surface, no autonomous execution.
- Ground Truth Hub inbound was already signed and drafts-only: 328 accepted events, all with `signature_status = valid`, each writing a `messages` draft, a `capture_routes` row and an `audit_log` receipt.
- Telegram inbound created notes, commitments and `staged` actions — never an execution.
- `actions` executed count on the owner account: 0. Nothing has ever run without approval.
- Obligations were already extracted into `document_obligations` during review, but had no review surface and no explicit conversion.

## What was missing
- Work desks led with nouns, not verbs.
- No single plain entry point for "I've got something".
- The reading tier folded on intake state only, and its summary did not say why it was quiet.
- First-run teaching was a storyboard; nothing followed a real item end to end.
- No version comparison for documents.
- Time and place were rendered without saying where they came from.

## Changes in this lap
See `vanta-first-hour-comprehension.md`, `vanta-physical-loop.md`,
`vanta-ground-truth-bridge.md`, `vanta-honest-context.md`,
`vanta-documents-maturity.md`.

## Still deferred, deliberately
CampCore messaging, broad Sherlock cross-analysis surfaces, multi-document
reports, autonomous agents, social auto-posting, streaks, scores, execution from
chat, calendar write-back.
