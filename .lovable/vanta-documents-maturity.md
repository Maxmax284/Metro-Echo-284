# Documents — beta toward real

## Version compare
- `src/lib/documentDiff.ts` — pure LCS line diff, plus classification of changed
  lines into dates, amounts, parties/names and obligations, and an explicit
  uncertainty list.
- `DocumentCompareSheet.tsx` — pick any two versions, read the grouped changes
  and the full marked-up text. Descriptive only: no verdicts, no advice, no
  arithmetic claims. Reading only — neither version is altered.
- With one version it says so instead of faking a comparison.

## Obligation review
- `ObligationList.tsx` renders each obligation as: who owes what, by when, under
  what condition, and where in the document it came from ("Clause reference not
  captured" when it was not).
- Conversion is an explicit tap: "Make it a promise" writes an open commitment
  with the source clause recorded; "Prepare a step" writes a `proposed` action
  that still needs approval. Each conversion writes an `audit_log` receipt.
- Nothing converts silently. No obligation becomes a Commitment or Action
  without a tap.
- When nothing was extracted, the panel says why (likely an image-only scan)
  rather than reporting emptiness.

## Preserved
Dictation revision, multi-turn intake, PDF/Word export, provenance, receipts,
scope. The BETA banner stays truthful: cross-document analysis, multi-doc
reports and attorney handoff remain parked.
