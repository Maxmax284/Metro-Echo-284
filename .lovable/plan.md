# Companion Maturity — Stage 2 of the sequence

Awareness now looks like radar. Companion still looks like a chat window with a paperclip. The concept says "field companion"; the surface needs to prove it.

Five focused changes. No new tables, no new edge functions, no taxonomy shifts. Everything builds on `CompanionWidget`, `ConversationSurface`, `ConversationDock`, `useIntentHandler`, and the existing `COMPANION_TOOLS` registry.

---

## 1. Glanceable Companion header

`CompanionWidget.tsx` header is currently one dense run-on line. Restructure to a two-row chip strip so a user can tell — without reading — where they are, what mode they're in, and what the system knows.

Row 1 (identity): `Companion` title · mode chip (Observer/Advisor/Operator/Locked, tinted) · "drafts only" pill.
Row 2 (situation): surface chip · place chip with freshness dot + confidence (reusing same color logic as `LayerChips`) · stale warning if applicable.

Mode chip is tappable and opens the existing mode switcher inline (small popover listing the four modes — uses `useMode().setMode`). No new state.

## 2. Surface-aware empty state

When `msgs.length === 0`, replace the single "Tell me what you're working on" line with:

- One sentence framed for the current surface (e.g. on `awareness`: "I can read your radar, explain a layer, or stage a draft."; on `actions`: "I can walk you through a draft before approval, or propose a new one.").
- Three suggested prompts chosen from `COMPANION_TOOLS` filtered by `getToolAvailability` for the current surface/mode/controls — rendered as tap-to-send chips. These reuse each tool's existing `buildPrompt` / `directAction`; no new prompts authored.
- A small "More tools" toggle that reveals the full filtered `CompanionTools` chip strip (component already exists, currently unused inside the widget).

Surface copy lives in a small map inside `ConversationSurface.tsx`. No registry change.

## 3. Inline draft receipts

Right now `useIntentHandler` fires a toast when it stages an action, commitment, or note — then it's gone. The thread doesn't reflect that anything happened.

After a successful `stage_action`, `add_commitment`, or `capture_note`, append a small assistant-side **receipt card** to the local `msgs` state (no DB write — the action row itself is the source of truth). Card shows:

- Icon + kind ("Drafted action" / "Commitment staged" / "Saved to memory")
- One-line summary
- "Open" link that navigates to the relevant surface via existing `useSignalRoute` verbs

Implementation: lift the receipt-append callback into `ConversationSurface` and pass it through `onIntent`. The handler still writes the row; the surface renders the acknowledgment. Renders as a distinct message variant (muted bg, dashed ring) so it doesn't get mistaken for chat.

## 4. Stop / cancel a stream

The send button turns into a spinner while streaming and the user has no way out. Add a "Stop" affordance.

- `ConversationSurface` keeps an `AbortController` ref tied to each `send()` call.
- While `streaming`, the send button in `ConversationDock` swaps icon to a square stop glyph (new optional `onStop?: () => void` prop). Click aborts the fetch, commits whatever text streamed so far to local state, marks the assistant message with `[interrupted]` suffix, persists what's there.
- No edge function changes — the abort is purely client-side.

## 5. Inline place / mode controls in the bubble

The floating bubble only opens the panel. Long-press / right-click could do more later, but for this pass keep it minimal and just add a subtle status dot on the bubble itself: freshness color from `useAwareness().overall`. Same logic as the HUD's existing dot. Gives the user a peripheral signal without opening anything.

---

## Explicitly NOT in scope

- No schema changes.
- No new edge functions; no changes to `vanta-converse`, `awareness-*`, `files-ingest`, `research-run`, `sherlock-investigate`.
- No new tools in `COMPANION_TOOLS` and no provider/gating changes.
- No changes to `useIntentHandler` semantics — it still draft-only, still mode-gated. Only adds an optional ack callback.
- No changes to the conversation persistence model (`conversations`, `messages` tables).
- No Sherlock, Memory, Intake, or Telegram work — that's the next pass.
- No "always-on" / proactive companion behavior. Still user-initiated.

---

## Files touched

- `src/components/companion/CompanionWidget.tsx` — header restructure, bubble status dot, inline mode popover.
- `src/components/surfaces/ConversationSurface.tsx` — empty-state composer, receipt-card rendering, abort wiring, `onIntent` ack plumbing.
- `src/components/shell/ConversationDock.tsx` — optional `onStop` prop + stop icon while streaming, optional `suggestions` prop for empty-state chips.
- `src/hooks/useIntentHandler.ts` — accept optional `onAck` callback; emit receipt events after successful inserts.

No new files unless a small `CompanionEmptyState.tsx` helper is warranted to keep `ConversationSurface` readable.
