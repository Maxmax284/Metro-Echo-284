# Backend Consolidation — Duplicate-Path Cleanup

Same product. Fewer internal paths. No schema changes, no new tables, no new
routes, no behaviour change intended.

## What was duplicated

| Pattern | Before | After |
| --- | --- | --- |
| CORS headers | 34 local `corsHeaders` objects | `_shared/http.ts` |
| Auth + 401 shape | 16 hand-rolled `getUser` blocks | `_shared/authContext.ts` (`resolveUser`) |
| Error bodies / statuses | ad-hoc per function | `_shared/errors.ts` (`failure`, one vocabulary) |
| AI gateway calls | 19 raw `fetch` sites, drifting models | `_shared/aiGateway.ts` (`chatText`, `chatCompletion`, `embedText`, `MODELS`) |
| Audit rows | 27 inline inserts | `_shared/auditEvent.ts` (`writeAuditEvent`) |
| Brief hashing / persistence / receipts | duplicated in `compose-brief` + `recap-compose` | `_shared/briefCore.ts` |

## Canonical primitives

- `_shared/http.ts` — `CORS_HEADERS`, `preflight`, `jsonResponse`, `okResponse`, `readJson`.
- `_shared/errors.ts` — `FailureKind` vocabulary → status + Vanta-voice message. Provider statuses normalize through `providerFailureKind`.
- `_shared/authContext.ts` — `resolveUser`, `resolveScopeContext`, `applyServerScope`, `serverScopeFields`. Server-side mirror of `src/lib/scope.ts`: a workspace the caller is not an active member of falls back to personal rather than leaking.
- `_shared/auditEvent.ts` — one receipt envelope (`from`/`to`/`success`/`source` in payload), best-effort so audit never blocks the operation.
- `_shared/aiGateway.ts` — single gateway client, model registry (`lite`/`fast`/`reasoning`), `parseJsonBlock` for fenced JSON.
- `_shared/briefCore.ts` — `signalsHash`, `receiptAppendix`, `persistBriefDraft`, `writeBriefReceipt`.

## Deliberately still separate

- `compose-brief` (AI-composed, format/audience-aware) vs `recap-compose` (deterministic, window-based) vs `project-summarize`. Different strategies, now sharing one persistence + receipt spine.
- The four inbound receivers (`gth-`, `campcore-`, `website-forms-`, `fenrir-`, `external-platform-inbound`) already delegate to `_shared/externalPlatform.ts`; each stays a thin 5-line entrypoint so per-platform config remains explicit.

## Verification

- `src/test/server-shared.test.ts` — characterization tests for HTTP, error vocabulary, audit envelope, server scope isolation, gateway JSON parsing, brief persistence.
- Full suite: 127/127 passing. Client typecheck clean.
- `deno check` clean on every function touched in this pass. Six untouched files
  (`_shared/webpush.ts`, `awareness-nearby-places`, `awareness-snapshot`,
  `briefing-compose`, `commitment-reminders`, `external-platform-diagnostics`)
  carry pre-existing type errors and were left alone.
