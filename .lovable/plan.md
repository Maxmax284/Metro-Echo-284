# V3 Stages 6 + 7 — Street Signal · Motion + Mobile (shipped)

(see prior plan content — kept for context.)

---

# Stages 1 + 2 — Structured signals + Vanta voice (this pass)

## Stage 1 — Voice + signal scaffolding
- `supabase/functions/_shared/vantaVoice.ts` — `VANTA_CORE_VOICE`, `AWARENESS_VOICE`,
  plus surface variants reserved for Stage 4 (Companion / Sherlock / Memory /
  Actions / Audit / Telegram / Intake). `VantaSignalSchema` (Zod) and
  `VANTA_SIGNAL_JSON_SCHEMA` (for Gemini `response_format`). `fallbackSignal()`
  helper for safe degradation.
- `src/lib/vantaSignal.ts` — matching TS types + tone/route label helpers (no
  UI shipped yet; awaits Stage 3).
- `src/lib/markdown.ts` — tiny stripper to keep legacy briefings clean.

## Stage 2 — Backend → structured signals
- **Migration**: `awareness_briefings.signal jsonb` (nullable; old rows unaffected).
- **`awareness-brief`** rewritten:
  - System prompt = `AWARENESS_VOICE`.
  - Gemini call uses `response_format: json_schema` bound to `VantaSignal`.
  - Zod-validates the response. If invalid OR call fails, persists a
    `fallbackSignal` ("I couldn't structure this signal cleanly — try
    refreshing or send it to Sherlock"). No raw prose ever lands in the UI.
  - Persists `short_summary` into `content` for back-compat with the existing
    HUD/drawer, plus the full structured `signal` in the new column.
- **`awareness-snapshot`** now emits a deterministic `location_warning` (no AI
  call) when GPS has no country/region match, weak accuracy (>500m), or no
  coords at all. Exposed in both `compact.location_warning` and
  `full_data.location_warning` — back-compatible additive change.
- No new external APIs, no auto-refresh, no page-render paid calls. apiGuard
  untouched.

## Validation
- `/mnt/documents/awareness_before_after_v1.md` — real AI-gateway runs comparing
  the legacy prose prompt vs the new voice + schema, across Transport, Hazards,
  Payments, Connectivity, and Location Warning (deterministic).
- Offshore case correctly produced `confidence: "low"`,
  `requires_confirmation: true`, `confirm_location` route, and a plain-English
  `confirmation_reason`.

## Back-compat notes
- Existing cached snapshots keep working (`location_warning` is additive).
- HUD continues to render `compact.summary` and ping list — no rendering
  contract changes this pass.
- API guard kill-switches unchanged.
- No paid call on page render.

## Out of scope (Stage 3+ — not started)
- UI shift: chips → radar layers, drawer rendering the structured signal,
  Generate→operational verbs.
- Global voice rollout to Companion/Sherlock/Memory/Notes/Actions/Telegram.
- Cross-surface routing wiring.

## Known pre-existing security warnings (NOT introduced by this migration)
- vector extension in `public` schema.
- `has_role`, `handle_new_user`, `rate_limit_hit`, `memory_search`, `notes_related`
  are `SECURITY DEFINER` and executable by authenticated users — by design.
- `update_updated_at_column`, `set_updated_at` SECURITY DEFINER trigger helpers.
- All present before this pass; left alone.

---

# Stages 4 + 5 — Voice rollout + Route wiring (this pass)

## Stage 4 — Global Vanta voice rollout
Shared voice fragments from `_shared/vantaVoice.ts` now prefix the system
prompts of every AI surface:
- `vanta-converse` → `COMPANION_VOICE`
- `telegram-webhook` → `TELEGRAM_VOICE`
- `awareness-query` → `AWARENESS_VOICE`
- `sherlock-investigate` (FULL + OVERLAY) → `SHERLOCK_VOICE`
- `notes-assist` (summarize + extract) → `MEMORY_VOICE`

Behavior contracts (tools, JSON schemas, hard caps) untouched — only the
tone/voice header changed. No new external APIs, no paid auto-calls.

## Stage 5 — Cross-surface route wiring
- New `src/lib/useSignalRoute.ts` — single handler maps every
  `available_routes` verb to a real action:
  - `refresh_signal` / `confirm_location` / `use_saved_place` → snapshot +
    briefing refresh via `useAwareness`.
  - `send_to_sherlock` → `openSherlock({ entity_type: "briefing", … })` with
    summary + why + next + long_detail composed as scope text.
  - `ask_vanta` → copies a prefilled question to clipboard (Companion dock has
    no prefill API yet; Stage 6 can wire that).
  - `save_to_memory` → inserts a `notes` row owned by the current user.
  - `create_commitment` → inserts a `commitments` row.
  - `draft_action` → toast placeholder (actions-transition wiring deferred to
    Stage 6 to keep this pass surgical).
  - `dismiss` → no-op.
- Wired into `AwarenessHUD` (location_warning card, focused-ping card,
  drawer) and `AwarenessSurface` (per-section cards). All three placeholder
  `toast("Route: …")` callsites swapped.

## Remaining
- Stage 6 — legacy cleanup + final QA: retire prose chip rendering once the
  new path is stable, wire Companion dock prefill for `ask_vanta`, wire
  actions-transition for `draft_action`, and re-run before/after validation
  across all surfaces.
