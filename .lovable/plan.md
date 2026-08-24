# Perception, Research & Context Orchestration — Architecture Phase

This phase is documentation plus thin type seams. No new rooms, no new UI, no behavior change, no new connectors.

## What exists today (verified)

- **Research**: `supabase/functions/research-run` runs quick (1 search) or deep (up to 3) via SerpApi, then synthesizes with the AI gateway. Sources are stored as flat `{title, url, snippet, provider, position}` — no authority, freshness, or category. No query sanitizer.
- **Perception**: `files-ingest` already does PDF/DOCX text extraction and image OCR through the gateway, plus doc-type classification, entity extraction, sensitivity, confidence, and `review_status`. `documents-extract` copies that text into document versions.
- **Sherlock**: `sherlock-investigate` exists as its own investigation path; it does not orchestrate perception or research.
- **Capability registry**: `src/lib/companionTools.ts` is a client-side tool registry with surface/mode/role/scope gating — it is not a server-side capability router.
- **Judgment/Presence**: the awareness pipeline in `supabase/functions/_shared/awareness/` already handles relevance, urgency, suppression, bundling, delivery.

So: extraction is live, research is partial, identification/interpretation/routing/sanitization are missing seams.

## Deliverable 1 — Audit

`.lovable/perception-research-orchestration-audit.md`, every claim pointing at real files, classified Live / Partial / Seam exists / Missing / Deferred, across: Ask, research, web search, Sherlock, Documents, OCR, file/image/voice/clipboard capture, metadata, object understanding, citations, working memory, continuity, internal retrieval, project linking, awareness, actions, scope, receipts, inbound webhooks.

## Deliverable 2 — Architecture doc

`.lovable/vanta-perception-research-context-architecture.md` covering the layered model (Perception → Research → Context → Judgment → Presence → Action), the three perception jobs (extraction / identification / interpretation), confidence states, research depth modes, source quality and disagreement, the retrieve-first rule, the private-context boundary (`private context → sanitized public query → external research → private synthesis`), capability router and registry, Sherlock escalation, four-room integration, retention, future device compatibility, and a phased roadmap with Live/Partial/Planned/Deferred labels.

## Deliverable 3 — Thin code seams (types + pure functions + tests)

New shared modules, mirrored client and server where needed, nothing wired into runtime behavior yet:

- `perception.ts` — `PerceptionJob` (extract | identify | interpret), `PerceptionResult`, `Confidence` (`high | probable | uncertain | unreadable | partial`), hierarchical identification levels.
- `research.ts` — `ResearchIntent` (lookup | compare | verify | investigate | monitor | explain), depth model, `ResearchSession` type, normalized `SourceResult` (title, source, url, published_at, category, authority, freshness, excerpt, retrieved_at, query_id, verification_state) plus a pure `classifySource()` / `normalizeSource()` pair.
- `sanitizeQuery.ts` — pure function stripping names, private project titles, secrets/tokens, and private document text; returns the public query plus a list of what was withheld.
- `capabilityRouter.ts` — pure interface: given request text, attachments, scope, and context, returns required perception tasks, retrieval tasks, research intent/depth, Sherlock escalation flag, confidence requirement, compression mode, and whether an action may be prepared. Pure decision only — it never calls anything.
- `sherlockEscalation.ts` — the escalation contract mapping phrases like "read this" / "identify this" / "verify this" / "Sherlock this" onto capability sets.

Tests under `src/test/` for routing, research intent, confidence handling, sanitization, source normalization, escalation, scope inheritance, no-action-bypass, and no research-to-notification shortcut.

## Guardrails

Four rooms unchanged. Action approval unchanged. Research cannot notify directly — it must pass through the awareness pipeline. No secrets or private payloads in any external query. Existing tests stay green; typecheck clean.

## End of phase

The audit picks the next construction phase (likely external research orchestration, perception normalization, or Sherlock orchestration) and recommends it without starting it.
