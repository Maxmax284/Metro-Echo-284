# Honest time and place

`src/lib/honestContext.ts` (pure) plus `ContextSourceLine.tsx` (presentation).

Every surfaced time or place says where it came from:

- "Bangkok time · the timezone you set"
- "Bangkok time · from calendar"
- "Bangkok time · timezone confirmed from event source"
- "Local time · device source · not confirmed"
- "Approximate area · Bangkok · coarse location"
- "No place signal · Vanta is not guessing one"

Rules enforced by tests:
- A browser clock is never presented as a confirmed zone.
- A coarse signal always says "approximate" and "coarse location".
- An inference is labelled "Inferred — tell Vanta if it is wrong."
- With no signal, Vanta says so instead of inventing one.

Wired into Today's hero (clock provenance) and the Awareness place line
(saved vs approximate). No new sensors, no new permissions, no exact location.
