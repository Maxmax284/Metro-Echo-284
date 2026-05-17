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
