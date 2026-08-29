# Vanta Next Lap — all five phases, in order

No fifth room. No second chat surface. Nothing executes from capture or from a bridge. Plan → Approve → Execute stays inside Vanta. Calendar stays read-only this lap.

## Phase 1 — First-hour comprehension

**Verb-first desk lines.** Every Work desk leads with what you do there: Projects "Keep a job together", Inbox "File what came in", Commitments "Keep a promise", Actions "Approve a step", Briefs "Build something shareable", Documents "Review and revise files", Schedule "See what time is doing", Memory "Find what Vanta already knows", Sherlock "Investigate what feels off", Awareness "See what Vanta is noticing", Cockpit "Read the dense operational view". Existing vocabulary only; no new object names.

**"I've got something."** One obvious entry point in Today and Work with three doors:

```text
Just park it     -> Capture / Inbox
It's a promise   -> Commitment flow (draft, you confirm)
It needs a step  -> prepared Action flow (draft, you approve)
```

Nothing executes from the chooser, nothing bypasses scope, and if routing is uncertain it asks before filing.

**Quiet reading tier.** For new or low-activity accounts the reading rooms (Memory, Sherlock, Awareness, Cockpit) stay collapsed with one line: "Where Vanta looks · nothing needs your attention yet". Real findings are never hidden — any live finding forces it open.

**One guided lap, on real content.** First run walks your actual capture: capture it → route it → see where it landed → see the receipt → see how it can surface on Today later. No carousel. The existing no-data storyboard stays as an optional replay.

## Phase 2 — Prove the physical loop on the owner account

Telegram first: phone message → draft in Vanta → review → approve inside Vanta → confirmation → receipt.

Verified against real records: arrival, draft is non-executing, scope correct, source visible, next step prepared but not taken, approval only in-app, receipt after execution, rollback shown only where real, quiet hours respected.

Failure paths exercised: quick note, commitment, prepared action, attachment, duplicate message, malformed input, missing context, stale context, wrong-scope attempt, approval on another device, interrupted approval, network failure, receipt retry, rollback where supported. Validated at 384px.

## Phase 3 — Ground Truth Hub bridge live

Inbound stays signed, scoped, drafts-first, audited, non-executing on arrival. It may create a draft; it may never create a booking, change a payment, approve a state change, run operational logic, or bypass approval. Cards read "From Ground Truth Hub" or "Drafted from Ground Truth Hub · needs review". Unsigned inbound is rejected and logged.

## Phase 4 — Honest time and place

Every surfaced time or place says where it came from and how sure it is: "Thailand time · from calendar", "Local time · device source", "Approximate area · coarse location", "Timezone confirmed from event source". No silent browser-clock truth, no fake exact location.

## Phase 5 — Documents: beta toward real

**Version compare.** Pick two versions of a document and read the difference plainly: added text, removed text, changed obligations, dates, parties, amounts, and what is uncertain. Descriptive and source-grounded — no verdicts.

**Obligation review.** Obligations already get extracted during review; this gives them a surface: who owes what, by when, under what condition, and where in the document it came from. Converting one into a Commitment or Action is always your tap. Nothing converts silently.

Dictation revision, multi-turn intake, PDF/Word export, provenance, receipts and scope all stay as they are.

## Deferred, by name

CampCore messaging, broad Sherlock cross-analysis surfaces, multi-document reports, autonomous agents, social auto-posting, streaks, scores, execution from chat.

## Technical notes

- `src/lib/deskRoles.ts` — add a `verb` line per desk; Work tiles and `DeskInfo` lead with it.
- New `src/components/intake/GotSomethingChooser.tsx` — three routes reusing existing capture/commitment/action draft paths; opened from Today and Work. No new store.
- `WorkSurface.tsx` — tier 3 `CollapsibleSection` default-closed when intake and findings are both empty; forced open when a live finding exists.
- Guided lap: extend `TutorialProvider` with a five-step real-item lap keyed off the user's first capture id; storyboard demo kept as replay only.
- Phase 2 is verification plus fixes, not new surfaces: exercise `telegram-webhook` → capture → `actions-transition` → `actions-execute` → receipt on the owner account, with tests in `src/test/` for source/scope retention, approval requirement, receipt write, and no implicit cross-device approval.
- Phase 3: confirm signature verification and drafts-only behaviour in `_shared/externalPlatform.ts` / `gth-inbound`, add a visible source badge, and tests for signed-accept / unsigned-reject / draft-only / scope isolation.
- Phase 4: a small `TimeSource` / `PlaceSource` presentation pair fed by existing timezone and awareness fields; label inferred values as inferred.
- Phase 5: version diff helpers in `src/lib/documents.ts` over `document_versions`, a compare view in `DocumentDetailSheet`, and an obligations list reading `document_obligations` with explicit convert actions.
- Docs written at the end: `.lovable/vanta-next-lap-audit.md`, `vanta-first-hour-comprehension.md`, `vanta-physical-loop.md`, `vanta-ground-truth-bridge.md`, `vanta-honest-context.md`, `vanta-documents-maturity.md`.
- Each phase: focused tests, then full Vitest and `tsgo --noEmit` at the end. 384px checked per phase.
