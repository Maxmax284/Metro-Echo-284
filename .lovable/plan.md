# Execute Confirmation + Today Layer Consolidation

## Audit first — what already exists

Checked before writing this plan:

- **Today already exists.** `src/components/surfaces/TodaySurface.tsx` (303 lines) is live as the first primary tab and default surface. It already answers needs attention / what's next / what changed / fresh in, is scope-filtered through `applyScope`, and uses `.vanta-card`, `LoadingState`, `EmptyState`.
- **Ask Vanta already exists as a primary path.** `src/components/today/AskVantaBar.tsx` sits at the top of Today with quick asks that open the companion with prefill.
- **Structured responses already exist.** `src/lib/vantaBlocks.ts` + `StructuredResponse.tsx`, and approval cards with live Stage / Approve / Execute buttons in `InlineApprovalActions.tsx`.
- **Navigation consolidation already started.** `SurfaceTabs.tsx` has 5 primary tabs (Today, Inbox, Projects, Briefs, Receipts) with Cockpit, Memory, Actions, Commitments, Schedule, Sherlock, Aware in the More sheet.
- **Approval flow already exists** in `ActionsSurface.tsx` (stage → approve with typed confirm for non-low-risk → execute → rollback dialog).

So this phase is **refinement and one real safety gap**, not a new Today layer. No second command center, no second assistant surface, no new tables.

## The real gap: Execute has no confirmation

Confirmed in the code: approving a non-low-risk action requires typed confirmation, but **Execute runs immediately** in both places it is reachable — `ActionsSurface.execute()` and `InlineApprovalActions.execute()`. That is the one destructive step with no "verify intent and details" moment.

### What gets built

A single shared **Execute confirmation dialog** used by both call sites:

- Title/summary of the action, its risk level in plain English, and the target it affects.
- Details block: description, affected entities, source, and the executor that will run it (webhook / Telegram / manual) — so intent is visible before anything runs.
- What happens after: it runs, and a receipt lands in Receipts.
- Buttons: Cancel / Run it. Low-risk reversible actions confirm with one tap; standard and high risk require typing the confirm word, matching the existing approve gate.
- Reversibility line: whether it can be undone afterwards.
- Mobile-first: bottom-sheet feel, 44px targets, no tiny text.

One component, reused. The existing approve and rollback dialogs stay exactly as they are.

## Today layer refinements (low risk, presentational)

1. **Quiet status.** When nothing needs attention, replace the stack of empty cards with one calm line: what's clear, next scheduled item, count of today's commitments.
2. **Grouped attention instead of item dumps.** Roll per-project noise into one line ("CampStay has 3 items needing attention") that drills into the owning surface, rather than listing each row.
3. **Security line, not a Fenrir rebuild.** One row: "Security looks good." / "Fenrir blocked one unusual login. No action required." Expanding hands off to the existing security/audit surface. No Fenrir redesign.
4. **Progressive loading.** Today's critical summary (attention + next) renders as soon as it resolves; the changed / fresh-in feeds fill in after. A slow or failing secondary feed shows an inline error row instead of blanking the page.
5. **Calmer visuals.** Fewer nested cards, more whitespace, stronger heading hierarchy, tighter mobile spacing at 384px.

## Ask Vanta gets the active scope explicitly

Confirmed gap: the conversation request body sends only `conversation_id` and `message` — the active scope is not passed. This phase sends the active scope with each ask and scopes the assistant's reads to it, so "What matters?" means "what matters in this exact space". No new AI capabilities.

## Explicitly deferred

Route restructure to Today / Work / Ask / Receipts is documented as the direction but **not executed** this phase — Inbox and Projects stay separate tabs. Also deferred: long-term AI memory, autonomous actions, cross-scope views, voice mode, notification automation, Fenrir rebuild, schema changes.

## Technical notes

- New: `src/components/actions/ExecuteConfirmDialog.tsx` (shared), consumed by `ActionsSurface.tsx` and `InlineApprovalActions.tsx`.
- `TodaySurface.tsx` refactored into small section pieces with independent load states; aggregation logic extracted to a scope-aware hook so it can be tested without rendering.
- Scope passed in the `vanta-converse` request body; the function filters its reads by it.
- Tests added to the existing suite (currently 63 passing): execute confirm blocks until confirmed, low-risk one-tap vs high-risk typed path, Today attention ordering and grouping, Today respects Personal vs workspace scope, scope switch refetches, Ask Vanta carries scope, quiet-state behavior, receipt links stay valid. Coverage does not shrink.
