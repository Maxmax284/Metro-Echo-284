# Ask Architecture + Four-Room Experience Pass — Audit

Status legend: **Live** / **Partial** / **Missing** / **Duplicated** / **Reuse** / **Replace** / **Deferred**

## Phase 0 — Operational loose ends

| Item | Status | Notes |
|---|---|---|
| Inbound email → capture | Live | `email-inbound` normalizes into capture; scope inheritance via `email_inbound_addresses.default_organization_id` / `default_scope` / `default_project_id`. No Mail room. |
| Attachment handling on inbound email | Partial | Only text body + sender/subject/timestamp preserved. Attachments not routed into file intake. |
| Telegram fast path for high-signal events | Live | `reachInboundSignal` + `deliver.ts` messaging channel; sweep still handles lower-value items. |
| Central Judgment authority | Live | No source-to-Telegram shortcuts; urgency/suppression/quiet-hours/dedupe/budget all in `_shared/awareness`. |

## Phase 1A — Thread data model

| Item | Status | Notes |
|---|---|---|
| `conversations` thread fields | Live | `organization_id`, `scope`, `pinned`, `archived_at`, `deleted_at`, `auto_titled`, `context_kind/id/label`, `last_message_at`. Additive migration, history preserved. |
| Scope isolation (client) | Live | `threadMatchesScope` + `useActiveScope()` refetch. |
| Scope isolation (RLS) | **Fixed this pass** | Policy was `auth.uid() = user_id` only. Now also requires org membership for workspace threads; blocks attaching a thread to a workspace you are not in. |
| Lifecycle: rename / pin / archive / delete | Live | Delete writes an audit receipt; archive is retrievable and distinct from delete. |
| Auto-title from first substantive intent | Live | Lead-in stripping in `askThreads.ts`; stops regenerating after manual rename (`auto_titled`). |
| Legacy history migration | Live | Existing rolling history retained as threads; no fabricated context links. |

## Phase 1B — Thread spine and context

| Item | Status | Notes |
|---|---|---|
| Desktop thread rail | Live | `ThreadSpine.tsx` → `ThreadRail`. |
| Mobile thread picker sheet | Live | `ThreadBar` + sheet, validated at 384px. |
| Context binding fields | Partial | Columns and chip render exist; only project/document bindings are wired. Commitment, action, receipt, Sherlock, Today-signal, calendar, mailbox bindings **Missing**. |
| "Open Ask with context" contract | Missing | No shared `openAskWithContext()` helper; callers would each invent their own. Next unit of work. |
| Output reference chips (`2 drafts · 1 note`) | Missing | Threads do not yet record produced artifacts. |

## Phase 1C — Quick Ask vs full Ask

| Item | Status | Notes |
|---|---|---|
| One thread engine | Live | `AskThreadProvider` owns identity/scope/messages/state; room + dock both consume it. |
| Desktop quick Ask as drawer | Partial / Replace | `ConversationDock.tsx` is still a floating widget rather than a right-side snap drawer. |
| Mobile quick Ask sheet depth (partial → full height) | Partial | Sheet exists; no depth escalation. |
| "Continue in Ask" promotion, same thread | Partial | Thread identity survives, but there is no explicit promotion control or promotion suggestion rules. |

## Phase 1D — Capability registry

| Item | Status | Notes |
|---|---|---|
| Central registry | Live (Reuse) | `src/lib/companionTools.ts` — surface/mode/owner/provider gating, `createsDraft`, `needsApproval`, honest disabled reasons. Do not build a second registry. |
| Registry metadata gaps | Partial | Missing `allowedScopes`, `outputBlockType`, `hiddenFromDirectInvocation`, device-capability gate. |
| Slash menu bound to registry | Partial | Tool menu reads the registry; a `/` inline command menu is **Missing**. |
| Capabilities as blocks not rooms | Live | `vantaBlocks.ts` + `StructuredResponse.tsx` is the expansion seam. |

## Phase 2 — Four-room experience

| Item | Status | Notes |
|---|---|---|
| Motion primitives (single system) | Live | `motion.ts`, `flip.ts`, `motionPrefs.ts`, kinetic focus in `index.css`. Reduced motion respected. |
| Today living bulletin | Live | `LiveBulletin.tsx`, rolling counters, staggered arrival, nouns-not-numbers change rows. |
| Today state-of-day line | Partial | Digest header exists; not yet a single grounded pressure sentence. |
| Work week horizon | Live | `WeekAgenda.tsx` + `AgendaStrip.tsx`. |
| Work project vitality | Live | Real-data sparklines, `projectHealth.ts`, stale markers. |
| Ask streaming / thinking state | Partial | Writing caret + `ProcessingLine.tsx`; blocks do not land one at a time, no per-block settle. |
| Receipts physicality | Live | `ReceiptSlip.tsx` thermal treatment, expand to full audit trail. |
| FLIP shared travel breadth | Partial | Wired for sheets and re-entry; not yet on Work project cards, action rows, Sherlock findings. |
| Shell weather / ambient grid | Live | `weather.ts` → `data-weather`, drifting topographic background. |
| Feel intensity levels | Partial | Room-motion duration/drift controls exist; no Minimal/Standard/Expressive preset. |
| Four-room navigation unchanged | Live | Today / Work / Ask / Receipts. No fifth room. |

## Intentionally deferred

- Voice Ask, wearable Ask, OCR/vision tools (seam only, per §53).
- Advanced thread search UI — natural Ask retrieval preferred.
- Cross-scope search of any kind — forbidden by doctrine.

## Known pre-existing DB linter noise (not introduced by this pass)

`SECURITY DEFINER` function execute grants and two `public` extensions predate this work. Tracked separately; not part of the Ask pass.

## Recommended next order

1. `openAskWithContext()` contract + remaining context bindings (1B).
2. Thread output references (1B).
3. Desktop dock → right-side drawer + explicit "Continue in Ask" promotion (1C).
4. Registry metadata + `/` menu (1D).
5. Ask block-by-block streaming settle, Today state-of-day line, broader FLIP (2C/2A/2E).
