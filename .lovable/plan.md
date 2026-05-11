
# Vanta V2 — Sherlock Overlay & Core Gap Closure

Preserves the core law: **Input → Structure → Review → Approve → Execute → Audit**. No shell rebuild, no backend replacement, no weakening of approvals, audit, or rollback. Work is grouped into 5 phases so each phase ends in a coherent, shippable state.

---

## Phase A — Sherlock as a Contextual Overlay (Parts 1, 2)

Convert Sherlock from a tab into an intelligence rail callable from anywhere.

- New `SherlockOverlay` component:
  - Desktop: right-side slide-in rail (Sheet, `side="right"`, ~420px).
  - Mobile: bottom-sheet (Drawer) with sticky section chips.
  - Sections: **Risk**, **Missing Information**, **Related Context** (default); collapsible **Contradictions**, **Weak Assumptions**, **Dependencies**, **Blind Spots**.
  - Each finding card → actions: Save to Notes · Turn into Action · Create Commitment · Add Reminder · Ask Follow-up · Add to Daily Review.
- `useSherlock()` hook + global context: `openSherlock({ scope, entity_type, entity_id, text })`.
- Trigger affordances on Conversation messages, Note rows, Action cards, Commitment rows, Awareness briefings, ingested files, and memory results (small "Analyze" icon button).
- `SurfaceTabs`: remove standalone Sherlock tab; keep the surface page reachable from the overlay's "Open full investigation" link to preserve deep history. (Audit + others unchanged.)
- Extend `sherlock-investigate` edge function to accept `{ scope, entity_ref, text }`, return a structured JSON envelope:
  ```
  { risks[], missing_info[], related[], contradictions[], assumptions[], dependencies[], blind_spots[], confidence }
  ```
  with citations to note/message/action IDs when available. Keep RLS + rate limit (10/min).
- **Conversation routing**: extend `vanta-converse` system prompt + tools with `run_sherlock` tool. Phrases like "analyze this / what am I missing / what risks / compare these" route to it. Result streams back as an `intent: { name: "sherlock_result", args: {...} }` and renders as an inline artifact card in `ConversationSurface` that can open the overlay.

## Phase B — High-Risk Approvals & Rollback UI (Parts 3, 4)

- `ActionsSurface` enhanced review modal for `risk = high`:
  - Risk summary, listed dependencies (from action payload + Sherlock cache), rollback availability, latest Sherlock findings inline, type-to-confirm phrase ("approve") before Approve becomes enabled.
  - Approval writes `action_events` row with `actor='user'`, `reason='high_risk_confirmed'`.
- Rollback panel:
  - New section "Recently Executed" (last 20) with timestamp, source surface, affected entities (from `payload.entities`), and a **Restore** button when `rollback_available=true`.
  - "Rolled Back" tab listing reverted actions and their event lineage.
  - `actions-transition` edge function gains a `rollback` transition (`executed → rolled_back`) writing both `action_events` and `audit_log`.

## Phase C — Conversation→Awareness Routing (Part 5)

- Add `query_awareness` tool to `vanta-converse`. LLM routes location/place questions ("SIM card here", "safe at night", "taxis") to it.
- Tool calls `awareness-brief` with the user's active place, returns content + confidence + sources.
- Render in conversation as an Awareness artifact card with **Save this · Turn into Plan · Remind me later** quick actions, plus an "Analyze" button into Sherlock.

## Phase D — Ingestion Hardening (Parts 6, 7)

- `email-inbound`: finalize parsing (subject → title, body → note, attachments → `ingested_files`), embed, run `memory-autolink`, and propose actions/commitments via a lightweight LLM extraction call. Idempotency via message-id.
- `files-ingest`: support **PDF**, **DOCX**, **TXT**, **Markdown**, and **image OCR**.
  - PDF: `pdf-parse` (Deno-compatible) or `pdfjs-dist`.
  - DOCX: `mammoth` via esm.sh.
  - Images: OCR via Lovable AI Gateway vision model (`google/gemini-2.5-flash`) returning extracted text.
  - After extraction: create note, embed, autolink, and emit suggested actions/commitments (stored on `ingested_files.metadata.suggestions`).
- Surface "Analyze with Sherlock" on every ingested file row.

## Phase E — Real Executors (Part 8)

`actions-execute` gains real executor branches, dispatched by `actions.payload.executor`:

- **Google Calendar** (`gcal_event`): uses user-stored OAuth in `action_executors.config`. If missing, action transitions to `needs_credentials` and a nudge is created.
- **Email draft** (`email_draft`): uses Resend (or provider configured in executors) to create a draft-style send to the user's own inbox with "Draft:" prefix; full send requires explicit high-risk approval.
- **Generic webhook** (`webhook`): POSTs payload with HMAC signature (secret from executor config).
- **Telegram outbound** (`telegram_send`): uses existing bot token + linked chat to send the message.

Every executor:
1. Reads action, verifies `status='approved'`.
2. Executes, captures `result` (status code / id / link).
3. Writes `action_events` (`approved→executed`) + `audit_log`.
4. Stores `rollback_token` in `result` when reversible (calendar event id, telegram message id) so the rollback UI can call a reverse path.

## Phase F — Visibility & Mobile Polish (Parts 9, 10)

- `SurfaceTabs`: ensure Conversation, Memory, Actions, Awareness, Audit are visible primary tabs on desktop and a horizontally scrollable, sticky tab bar on mobile. Sherlock available via floating "Analyze" FAB on mobile.
- All overlay actions reachable with thumb: bottom-sheet sticky action chips, large hit targets (min 44px), safe-area padding.
- Add "Analyze" icon button on conversation message bubbles, note rows, action cards.

## Phase G — Validation (Part 11)

Manual + scripted checks:
- Sherlock overlay opens from each surface with correct scope.
- Conversation prompts trigger Sherlock + Awareness tools (verify SSE intent events).
- High-risk approval requires confirmation phrase; lineage in `action_events`.
- Rollback UI shows executed actions and successfully reverts.
- Email-in: sending to an inbound address creates a note + linked file + suggestions.
- File ingestion: upload one PDF, one DOCX, one image — each yields extracted text and embeddings.
- Each executor: at least one successful run with `audit_log` row.

---

## Technical notes

- Database additions (single migration):
  - `actions`: add `risk_acknowledged_at timestamptz`, `rollback_available boolean default false`, `rollback_token text`, `executed_at timestamptz`, `rolled_back_at timestamptz`.
  - Extend `action_status` enum: add `rolled_back`, `needs_credentials`.
  - `sherlock_findings_cache` table keyed by `(entity_type, entity_id)` for fast overlay reopen (RLS own-row).
  - Indexes on `actions(user_id, status, updated_at desc)` and `action_events(action_id, created_at desc)`.
- Edge function changes: `vanta-converse` (new tools), `sherlock-investigate` (structured output), `actions-execute` (executor branches + rollback metadata), `actions-transition` (rollback transition), `email-inbound` (full parse + suggestions), `files-ingest` (PDF/DOCX/OCR).
- Frontend: `SherlockOverlay`, `SherlockContext`, finding card, high-risk approval modal, rollback panel, conversation artifact cards (Sherlock + Awareness), mobile FAB. Continue using existing shadcn + semantic tokens; no new color literals.
- Secrets needed: `RESEND_API_KEY` (email draft), `GOOGLE_OAUTH_CLIENT_ID/SECRET` (Calendar). Will request via `add_secret` when Phase E starts.

## Out of scope

- No shell redesign, no new theme.
- No removal of existing audit, RLS, or rate-limit primitives.
- Native (Capacitor) packaging stays scaffolded.

---

If this looks right, I'll start with **Phase A (Sherlock overlay + conversation routing)** since it unlocks contextual value across every other surface. Want me to ship phases A→G in order, or reorder (e.g. real executors first)?
