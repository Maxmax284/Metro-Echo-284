# Vanta Perception, Research & Context Orchestration — Architecture

Perception and research are **capabilities**, not rooms. A user brings a photo,
a document, a voice note or a question into Ask or a card; Vanta decides what
methods the request needs, retrieves what it already knows, reaches outside only
when the outside is required, and answers in layers with honest confidence.

## Product laws

1. **Retrieve first. Reason second.** Internal records outrank a model's memory.
2. **Partial beats confidently wrong.** `partial` and `unreadable` are answers.
3. **Private context shapes the query; it never ships in it.**
4. **Input method is not a surface.** No "OCR tab", no "research tab".
5. **Perception observes. It never executes.** Plan → Approve → Execute stays in-platform.
6. **Depth is earned.** A lookup is not an investigation.
7. **Scope is absolute.** Every artifact inherits the active scope.
8. **Corrections land beside observations.** Evidence stays; the conclusion moves.

## Flow

```text
request (text + attachments + scope + verbosity)
        |
   capability router            <- pure decision, calls nothing
        |
   +----+-----------------------------+
   |                |                 |
perception     internal retrieval   research (optional)
extract        memory/projects      sanitize -> provider
identify       documents            normalize -> classify
interpret      commitments          rank -> agreement
   |           receipts/calendar        |
   +----------------+-----------------+
                    |
              synthesis (private)
                    |
        layered answer: bottom line -> detail -> sources
                    |
        aftermath: save / link to project / stage action (draft only)
```

## Layers

**Perception** has three distinct jobs. *Extract* answers what the input
contains, *identify* answers what it is, *interpret* answers what it means in
this user's context. Identification is hierarchical: category, then type, then
exact model — and it stops at the highest level it can actually support.

**Research** is graded by intent (`lookup`, `explain`, `compare`, `verify`,
`investigate`, `monitor`), which fixes depth. Every provider result is
normalized to one `SourceResult` carrying category, authority, freshness and
verification state, so sources can be ranked and disagreement can be said out
loud instead of averaged away.

**Context orchestration** is the router. It maps a request onto perception jobs,
retrieval targets, a research intent, and whether Sherlock's depth is warranted.
It also decides the minimum confidence required before Vanta states something
plainly, and whether an action may be *prepared* — never executed.

**Sherlock** is the deep end of this same pipeline: full retrieval, external
verification, contradiction hunting. Not a second brain, not a second room.

## Privacy boundary

`sanitizeQuery()` sits in front of every external call. It strips credentials,
contact details, private project names and people, truncates pasted bodies, and
returns a plain-English list of what was withheld. If nothing usable survives,
the call is **blocked** rather than degraded. Logs carry the sanitized query and
the withheld reasons — never the private payload.

## Aftermath

Every perception or research result must have a next life: keep it in memory,
attach it to a project, turn it into a commitment, or stage a draft action.
Research on its own is not a receipt; a state change is. `researchNeedsReceipt()`
encodes that so audit stays meaningful instead of noisy.

## Code seams (this pass)

- `supabase/functions/_shared/orchestration/perception.ts` — jobs, confidence vocabulary, extracted fields, hierarchical identification, corrections.
- `.../research.ts` — intents, depth, `SourceResult` normalization/classification/ranking, agreement, layered output, session shape, receipt rule.
- `.../sanitizeQuery.ts` — the privacy boundary and safe logging.
- `.../sherlockEscalation.ts` — natural phrasing → escalation level.
- `.../capabilityRouter.ts` — the single routing decision; `planMayExecute()` is permanently `false`.
- `.../index.ts` and `src/lib/orchestration/index.ts` — one import site per side.
- `src/test/orchestration.test.ts` — laws as tests: privacy, scope, confidence honesty, no execution.

All of it is pure. No UI changed, no room added, no runtime behavior altered
yet; `research-run`, `sherlock-investigate`, `files-ingest` and `documents-extract`
adopt these contracts in the next pass.
