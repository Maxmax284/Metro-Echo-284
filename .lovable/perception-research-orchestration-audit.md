# Perception / Research / Context Orchestration — Current-State Audit

Baseline as verified in code. Status vocabulary: **Live** (works end to end),
**Partial** (exists, incomplete against the model), **Seam** (contract now
exists, no runtime wiring yet), **Missing**.

## Perception

| Capability | Status | Where | Gap |
| --- | --- | --- | --- |
| Document/file text extraction (PDF, docx, OCR) | Live | `supabase/functions/files-ingest`, `documents-extract` | Extraction is not separated from interpretation; no per-field confidence |
| Structured field extraction (invoice/contract terms) | Partial | `documents-extract` | Fields land as prose, not `ExtractedField[]` with `unclear` markers |
| Object identification from a photo | Missing | — | No hierarchical level 1/2/3 identification anywhere |
| Barcode / label reading | Missing | — | Not attempted |
| Audio capture → text | Live | `VoiceCaptureCard` + transcription path | Transcript is treated as text only, never as perception with confidence |
| Screenshot intake | Live | `ClipboardImageIntake`, `GlobalDropZone` | Stored and routed; not read |
| Honest "unreadable / partial" outcomes | Seam | `_shared/orchestration/perception.ts` | Producers still return best-effort prose |
| Correction lands beside the observation | Seam | `applyCorrection` | No UI affordance yet |

## Research

| Capability | Status | Where | Gap |
| --- | --- | --- | --- |
| Web search + synthesis | Live | `supabase/functions/research-run` (SerpApi + Gemini) | Single depth; no intent grading |
| Normalized source shape | Seam | `_shared/orchestration/research.ts` | `research-run` still returns provider-shaped results |
| Source quality (category / authority / freshness) | Seam | `classifySource`, `authorityOf`, `freshnessOf` | Not attached to stored findings |
| Disagreement reporting | Missing | — | Current synthesis flattens conflict into one voice |
| Multi-step investigation sessions | Partial | `sherlock-investigate` | Runs as one pass; no sub-question ledger |
| Monitoring / re-check over time | Partial | `sherlock-watch`, `awareness-drift-sweep` | Internal drift only, no external source watch |
| Layered output (bottom line → deeper) | Partial | `StructuredResponse` blocks | Shape exists in UI; research does not emit it |
| Research is not automatically a receipt | Seam | `researchNeedsReceipt` | `research-run` audits every call |

## Context orchestration

| Capability | Status | Where | Gap |
| --- | --- | --- | --- |
| Retrieve internal first, reason second | Partial | `workingContext.ts`, `memory-search`, `vanta-converse` | Retrieval happens, but is not a required precondition |
| One capability router | Seam | `_shared/orchestration/capabilityRouter.ts` | Callers still branch on their own |
| Escalation to Sherlock as a depth, not a room | Seam | `sherlockEscalation.ts` | Sherlock is entered explicitly by the user today |
| Private context never leaves verbatim | Seam | `sanitizeQuery.ts` | `research-run` passes user phrasing straight to the provider |
| Scope inheritance on produced artifacts | Live | `useActiveScope`, org-scoped tables | Router now carries the same rule |
| Channel-aware compression | Live | `_shared/awareness/compress.ts` | Reused by the router rather than duplicated |
| Nothing executes from perception or research | Live | Plan → Approve → Execute in-platform | `planMayExecute()` keeps it explicit and testable |

## Notable duplication to retire later

- `research-run` and `sherlock-investigate` each do their own retrieval,
  prompting and audit writing. Both should call the router and the normalizer.
- Confidence language is invented per surface (`sherlock/types.ts`, awareness
  pipeline, documents review). One `Confidence` vocabulary now exists.

## Guardrails confirmed unchanged

- Four rooms only: Today / Work / Ask / Receipts. No new perception or research room.
- Capture never executes; approval always happens in the platform.
- Scope filters every query; personal scope carries no `organization_id`.
