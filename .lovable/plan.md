## Why the briefing said "no active signals"

Your GTH test signal landed correctly — it's in `messages` (signal-only draft) and `capture_routes` (`source = ground_truth_hub`, `new_status = inbox`). `external_platform_webhook_events` also has the receipt with `accepted = true`.

But `briefing-compose` queries only: commitments, ingested_files, actions, notes, sherlock cache. **External-platform inbox drafts are never read.** That's the only reason the briefing showed nothing. The webhook contract is working.

## Part 1 — Make briefings see external signals (the real fix)

**`supabase/functions/briefing-compose/index.ts`**
- Add one more parallel query: pull recent unreviewed external signals.
  - From `messages` where `metadata->>signal_only = 'true'` AND `metadata->>needs_review = 'true'` AND `created_at >= sinceFresh`, ordered desc, limit 20.
  - Group by `metadata->>source_platform` for the count breakdown (gth, campcore, fenrir_lock, website_forms).
- New item kind: `external_signal` with `source` field (which platform), label = message content (truncated).
- New counts field: `external_signals` (total) plus `external_by_source` (`{ ground_truth_hub: 1, ... }`).
- Headline picks it up: e.g. `"1 from Ground Truth Hub"` joined into the parts list when nonzero.
- Best-first-move heuristic: insert a branch — if `external_signals > 0` and nothing higher priority (overdue/approvals), suggest `"Open inbox — 1 new from Ground Truth Hub"`.
- Hash seed includes the new counts/items so the cache invalidates when a new signal lands.
- Role gating: owner/manager see all sources; coach/viewer see only sources their role would normally see (for now: same as today since you're solo — gate scaffold only).

**`src/components/cockpit/OperationsBriefingPanel.tsx`**
- Extend `Counts` type with `external_signals: number` and `external_by_source: Record<string, number>`.
- `buildSourceLine`: append `"N from {platform display name}"` segments.
- `routeForBestMove`: new branch — when `external_signals > 0`, route to `memory` surface (inbox). 
- `labelForBestMove`: `"Open new signals"`.
- "Why this matters" list: external_signal items render with a platform badge instead of the generic kind chip.

**Verification path (no new UI):**
1. You fire the GTH self-test from Integrations settings (already wired).
2. The webhook lands → message + capture_route row created (already happens).
3. Open dashboard → briefing's "Refresh" → headline shows `1 from Ground Truth Hub`, narrative mentions it, "Why this matters" lists the test event. That's the closed loop.

## Part 2 — Collapse setup for Website Forms, Fenrir Lock, CampCore

All three already use the **same** `external-platform-inbound` plumbing as GTH — same signature contract, same diagnostics table, same self-test endpoint. The current 5–7 step checklists in `registry.ts` are misleading; the real flow is 3 steps.

**`src/lib/integrations/registry.ts`** — replace the `setupChecklist` arrays for `website_forms`, `fenrir`, `campcore` with the unified 3-step:
1. "Copy the webhook URL and generated secret from this card."
2. "Paste both into the sender's outbound webhook settings."
3. "Hit Test webhook here — green means done."

**`src/components/integrations/IntegrationCard.tsx`** — the existing "Test webhook" button (the GTH self-test) already works generically because `external-platform-selftest` accepts any registered source. Confirm it's shown for all three (not just GTH) and that the result block renders the same way. Small tweak only — no new component.

**No changes to:** signing contract, envelope shape, X-Vanta-Owner header, allowed events, or any edge-function behavior. The simplification is purely UI copy + making the existing test button visible across all platform cards.

## What I will NOT touch

- Live Capture, Aware bubble, Pulse — unchanged.
- GTH/CampCore/Fenrir/Forms edge-function code — already correct.
- AI summarization model or pricing path — same `if_match` hash skip still applies.
- Any execute/outbound path — capture-only stays capture-only.

## Files

- edit `supabase/functions/briefing-compose/index.ts`
- edit `src/components/cockpit/OperationsBriefingPanel.tsx`
- edit `src/lib/integrations/registry.ts`
- edit `src/components/integrations/IntegrationCard.tsx` (visibility tweak only)

## Acceptance

- Send a GTH `integration.test` via the existing Test button → within one Refresh, briefing headline includes `1 from Ground Truth Hub`, "Why this matters" lists it, best-first-move CTA opens the inbox.
- Same flow works for Website Forms, Fenrir, CampCore using the same 3-step card.
- No change in cost when nothing new arrives (`if_match` still short-circuits the AI).
