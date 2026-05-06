# Vanta V2 — Phase 1: Shell & Foundation

Build the V2 operational shell as a multi-user, mobile-first PWA-ready web app on Lovable Cloud. This phase establishes the design language, navigation philosophy, auth, and the four foundational systems: Conversation, Notes/Memory, Actions/Approval Queue, and Awareness. Bots, Sherlock, Files/Zones, and native Capacitor wrapping are deferred.

## Design Language

Premium, calm, cinematic, mobile-native. Dark-first theme with subtle glass surfaces, restrained motion, strong typography, generous spacing. Tokens defined in `index.css` and `tailwind.config.ts` — no hardcoded colors. One radius scale, one motion scale, semantic color tokens (surface, surface-elevated, accent, signal, warn, danger, muted).

## Navigation Philosophy

No page-centric menu. The shell is a **single continuous surface** with:

- **Conversational dock** — always-present command/chat input (bottom on mobile, bottom-center floating on desktop). Routes intent → notes, actions, awareness, memory.
- **Context rail** — collapsible side rail (desktop) / bottom-sheet (mobile) showing the active operational context: relevant notes, staged actions, awareness snippets, commitments.
- **Surfaces** (not "pages") accessed via swipe/sheet/keyboard, not a nav menu: Memory, Actions, Awareness, Audit. Each surface is a focused view, not a dashboard.
- **Operational state indicator** — quiet badge showing inferred posture (planning / executing / moving / capturing). Affects density and quick actions.

```text
┌─────────────────────────────────────────┐
│  ░ state · location · time              │  ambient header
├─────────────────────────────────────────┤
│                                         │
│         ACTIVE SURFACE                  │  conversation by default
│   (memory · actions · awareness · …)    │
│                                         │
├─────────────────────────────────────────┤
│  [ context chips: notes · actions · … ] │  context rail
├─────────────────────────────────────────┤
│  ▸ tell vanta…                    [⏎]   │  conversational dock
└─────────────────────────────────────────┘
```

## Phase 1 Systems

### 1. Conversational Surface

- Persistent thread, markdown rendering, streaming responses via Lovable AI Gateway (default model `google/gemini-2.5-flash`).
- Intent router (LLM tool-calling): `capture_note`, `stage_action`, `query_memory`, `ask_awareness`, `add_commitment`. Each tool produces a structured artifact surfaced inline as a card the user can review/approve.
- Conversations persist per user; full history sent each turn.
- No fake personality — concise, grounded, source-tagged when retrieving memory.

### 2. Notes / Memory Workspace

- Rich notes with tags, links between notes, links to actions/commitments/awareness entries.
- AI-assisted: summarize, extract action items, find related notes, structure raw capture.
- Fast capture from conversation dock or dedicated `+` quick-action.
- Search across content, tags, and semantic similarity (pgvector).

### 3. Actions / Approval Queue

- States: `proposed → staged → approved → executed → audited` (or `rolled_back`).
- Risk classification (`low_reversible`, `standard`, `high`). Low-reversible can auto-execute with audit; everything else requires explicit approve.
- Action queue surface shows: Ready to Act, Awaiting Review, Recently Executed, Rolled Back.
- Every state change written to an immutable `audit_log`.
- Phase 1 executors are placeholder/manual (no integrations yet); the pipeline and audit chain are real.

### 4. Awareness / Environmental Intelligence

- Location-aware (browser geolocation, opt-in) operational briefings: transport, infrastructure, payments, etiquette, hazards, scams, connectivity, timing.
- Cached briefings per place; layered detail (quick read → deeper context → section Q&A).
- Generated via AI with structured prompts; sources/confidence tagged.
- Accessible from conversation ("what's the deal with taxis here?") or Awareness surface.

### 5. Operational State (ambient)

- Inferred from time, location change, recent surface usage, conversation cadence.
- Affects: dock placeholder copy, surfaced quick-actions, notification quietness, density.
- Never a hard mode toggle — visible as a small chip, dismissible/overridable.

## Auth & Multi-tenancy

- Lovable Cloud auth: email/password + Google. Auto-confirm email on for fast iteration.
- `profiles` table (display name, avatar, timezone, home location).
- `user_roles` table with `app_role` enum (`admin`, `user`) + `has_role()` security-definer function. RLS on every table scoped to `auth.uid()`.

## Data Model (Phase 1)

```text
profiles(id→auth.users, display_name, avatar_url, timezone, home_geo)
user_roles(user_id, role)                           — separate, never on profiles
conversations(id, user_id, title, state, updated_at)
messages(id, conversation_id, role, content, tool_calls, created_at)
notes(id, user_id, title, body, tags[], embedding, updated_at)
note_links(from_note, to_note, kind)
commitments(id, user_id, summary, due_at, source_note, status)
actions(id, user_id, title, payload, risk, status, source, created_at)
action_events(id, action_id, from_status, to_status, actor, reason, created_at)
audit_log(id, user_id, entity_type, entity_id, event, payload, created_at)
awareness_places(id, user_id, label, geo, country, region)
awareness_briefings(id, place_id, section, content, sources, confidence, generated_at)
operational_state_events(id, user_id, inferred_state, signals, created_at)
```

All tables: RLS on, owner-scoped policies, `user_id not null`.

## Edge Functions (Phase 1)

- `vanta-converse` — streams conversational responses, runs intent router with tool-calling.
- `notes-assist` — summarize / extract / relate (single endpoint, action param).
- `awareness-brief` — generates/refreshes a place briefing (structured output).
- `actions-transition` — validates state transitions, writes `action_events` + `audit_log`.

All use Lovable AI Gateway (`LOVABLE_API_KEY`), validate input with Zod, return CORS headers, are owner-scoped via JWT verification in code.

## Mobile-First Specifics

- Bottom dock with safe-area padding; surfaces open as full-height sheets with drag-to-dismiss.
- Thumb-zone primary actions; secondary actions in a long-press radial or overflow.
- Gesture: swipe between Conversation ↔ Memory ↔ Actions ↔ Awareness.
- Desktop progressively enhances to a 3-column layout (rail · surface · context) without changing information architecture.

## Out of Scope (deferred)

- Telegram / WhatsApp bots
- Sherlock investigation system
- Files / Zones (watched folders)
- Capacitor native wrapper (PWA-readiness only — manifest + icons can come later)
- Real third-party action executors (Phase 1 = pipeline + manual execute)

## Implementation Sequence

1. Design tokens + global shell (header, dock, context rail, surface router, theme).
2. Lovable Cloud + auth (email/password + Google), profiles, user_roles, RLS helpers.
3. Conversation surface + `vanta-converse` edge function with intent router.
4. Notes surface + `notes-assist` (capture, list, edit, AI extract).
5. Actions queue + `actions-transition` + audit log surface.
6. Awareness surface + `awareness-brief` + geolocation opt-in.
7. Operational state inference (lightweight heuristic, client-side + event log).
8. Polish pass: motion, empty states, mobile gestures, keyboard shortcuts.

After Phase 1 ships and feels right, we layer in Sherlock, Files/Zones, bots, and native wrapping as separate plans.

&nbsp;

&nbsp;

Replace:

&nbsp;

“full history sent each turn.”

&nbsp;

With:

&nbsp;

“Conversation history is persisted per user and thread; each turn sends active conversational context with summarized memory/context windows as needed to balance continuity, performance, and token efficiency.”

&nbsp;

Replace:

&nbsp;

“Low-reversible can auto-execute with audit.”

&nbsp;

With:

&nbsp;

“Low-reversible actions may become eligible for lightweight one-tap confirmation later; in Phase 1 all actions still move through staged transitions with audit visibility and explicit user acknowledgment.”

&nbsp;

Add under Awareness / Environmental Intelligence:

&nbsp;

“Awareness provides practical operational context with confidence labels and source references where available. It does not guarantee safety, emergency accuracy, legal advice, medical advice, or real-time certainty.”

&nbsp;

Add under Conversational Surface:

&nbsp;

“The conversational layer should feel warm, grounded, calm, and operationally useful — not robotic, theatrical, or overly assistant-like. Tone should adapt subtly to user preference while remaining concise and context-aware.”

&nbsp;

Add under Mobile-First Specifics:

&nbsp;

“Mobile is treated as a first-class operating environment, not a responsive afterthought. All primary flows must be thumb-accessible, interruption-friendly, and fast to resume while moving through real-world environments.”

&nbsp;

Add under Navigation Philosophy:

&nbsp;

“The shell should behave like a continuous operational environment rather than a collection of disconnected tools or pages. Context follows the user instead of forcing the user to navigate for context.”

&nbsp;

Add under Out of Scope (deferred):

&nbsp;

“Deferred systems are architecturally anticipated during Phase 1 so later integration does not require redesigning the shell, routing model, audit structure, or conversational layer.”