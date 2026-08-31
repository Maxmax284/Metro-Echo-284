# Ground Truth Hub bridge

## Live and verified
- 328 inbound events, every one `signature_status = valid`, every one accepted.
- Unsigned, mis-signed, stale-timestamp, unknown-source, wrong-owner and
  duplicate-idempotency requests are rejected in
  `supabase/functions/_shared/externalPlatform.ts` before anything is written.
- Each accepted event writes: a `messages` draft with
  `signal_only: true, needs_review: true`, a `capture_routes` row, and an
  `audit_log` receipt (`ecosystem.gth.captured`).
- No booking, payment, state change or operational logic runs on arrival. The
  bridge has no execution path at all.

## Now visible in the UI
`resolveProvenance` recognises bridge tokens, so a capture from the hub reads
"From Ground Truth Hub", and the card carries the line
"Drafted from Ground Truth Hub · needs review" (`bridgeReviewLabel`).
CampCore and Fenrir Lock are named the same way for when they arrive.

## Boundaries
A bridge brings drafts, not authority. Approval stays inside Vanta, scope
isolation is unchanged, and every accepted event leaves a receipt.
