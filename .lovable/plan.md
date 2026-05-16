
# Vanta Awareness Radar + API Control Room — Audit & Plan

Status: **Stage 1 (the leash) shipped.** Stages 2–9 pending.

---


## Stage 0 — Audit (what already exists)

What we already have (from the prior 8 stages):
- `AwarenessProvider` with fresh/aging/stale/missing classification, confidence rollup, realtime invalidation. Consumed by header, Companion, Sherlock, Memory, Actions.
- Awareness tables: `awareness_places`, `awareness_briefings`. Edge functions: `awareness-brief`, `awareness-query`, `ambient-pulse`.
- Companion Widget, Sherlock overlay, Memory surface, Actions approval flow with risk gating + typed "approve", Audit log table, Commitments, Nudges.
- Permission Modes (`user_modes`: locked / observer / advisor / operator) gating intents.
- Lovable AI Gateway (Gemini, GPT) — no direct frontend AI calls.
- `rate_limit_buckets` table exists but is essentially unused and has no RLS / no enforcement helpers.

What is missing vs. the new spec:
- No Settings page at all. No owner/admin role surface beyond `user_roles`.
- No SerpApi integration. No Open-Meteo. No Google Calendar.
- No `usage_limits`, `api_usage_logs`, `api_cache`, `system_controls` tables.
- No backend API guard (`apiUsageGuard`, `checkRateLimit`, `recordApiUsage`, cache layer).
- No kill switches, no global usage mode (Conservative / Balanced / Power / Custom / Manual / Lockdown).
- No awareness *snapshot* — the dashboard pulls live briefings instead of a cached compact snapshot.
- Awareness tab is a list + per-section briefings, not a radar / Local Intelligence Map.
- Research is not a first-class object — no `research_objects` table, no SerpApi+Gemini pipeline, no "save to memory / commitment / draft action" surface.
- Command Center has no compact awareness strip / mini radar.
- Companion has no "Ask about area" context-aware tools.

What is sacred and will not be touched:
- Capture → Draft → Approve → Execute → Receipt → Audit contract.
- Permission Modes gating on intents.
- Existing `awareness_briefings` shape (we'll add snapshots alongside, not replace).
- `actions`, `audit_log`, `commitments`, `nudges` schemas.

---

## Stage 1 — The Leash (API Control Room + backend guard) — DO FIRST

The spec is explicit: build the leash before adding senses.

New tables (owner-scoped):
- `system_controls` — one row per owner. Global usage mode + per-provider kill switches (`serpapi_enabled`, `gemini_enabled`, `weather_enabled`, `calendar_sync_enabled`, `background_awareness_enabled`, `proactive_synthesis_enabled`, `file_analysis_enabled`, `deep_research_enabled`, `local_search_enabled`, `auto_refresh_enabled`).
- `usage_limits` — per (owner, provider, feature) caps: per_minute / per_hour / per_day / per_month / per_task. `auto_run_allowed`, `manual_approval_required`, `mode_override`.
- `api_usage_logs` — every external call attempt: status (allowed/blocked/cached/success/failed/rate_limited/disabled/over_budget), tokens/credits, cost estimate, cache_hit, related entity.
- `api_cache` — (provider, feature, query_hash, location_context) → result_json + expires_at.
- `app_role` already has `admin`; add `owner` enum value. Owner-only RLS on the four tables.

Backend (shared Deno module `supabase/functions/_shared/apiGuard.ts`):
- `apiUsageGuard({ owner_id, provider, feature, query, location?, task_id? })` returns `{ allow, reason, cached? }`.
- `checkRateLimit`, `recordApiUsage`, `getCachedResult`, `saveCacheResult`, `blockIfDisabled`, `blockIfOverBudget`, `blockLoopingTask` (per task_id call counter).
- All future external calls (SerpApi, Open-Meteo, Gemini via Lovable AI) route through this guard.

Frontend — new `/settings` route, owner-only:
- "Control Room" sections: Global Mode (Conservative / Balanced / Power / Custom / Manual / Lockdown), Provider Kill Switches, Per-Feature Limits, Usage Logs viewer, Cache stats, Emergency Disable-All.
- `ModeBadge`-style visual when in Manual / Lockdown.

Defaults shipped: Conservative-ish — auto-refresh off, awareness 60m, weather 30–60m, SerpApi quick=1 call, deep=3–5 + confirm, retries ≤2, background jobs disabled.

---

## Stage 2 — Awareness snapshot architecture

- New `awareness_snapshots` table: `owner_id`, `place_id`, `compact` (jsonb — the one-line status + top 3 signals + freshness + confidence), `full` (jsonb — top signals, timeline windows, weather summary, calendar slice, commitment flags, risk markers), `generated_at`, `expires_at`, `sources_used`.
- New edge function `awareness-snapshot` (guarded): assembles internal context (commitments, captures, calendar, memory hits, sherlock flags) + cached weather + optional SerpApi local search + Gemini synthesis → writes one snapshot. Returns cached when fresh.
- Frontend reads snapshot, never triggers paid calls on render. Manual refresh button only.
- Stale label is always visible — no hidden stale data.

---

## Stage 3 — Wire snapshot into existing provider

- Extend `AwarenessProvider` to expose `snapshot` (compact + full) alongside per-section briefings.
- All current consumers (header, Companion, Sherlock, Memory, Actions) read from snapshot for "operational status" and from briefings for deep-dive.
- No paid calls on mount anywhere.

---

## Stage 4 — Command Center compact awareness

- New `MiniRadarStrip` component in Command Center: zone · time · weather chip · 1-line summary · 1–2 active pings · "Open Awareness" link.
- Wire into `AmbientHeader`, Today, Top Focus, Approvals context, Sherlock Watchtower, Memory Pulse, Live Capture relevance label.
- Tiny "API health" indicator pulled from `system_controls` + recent `api_usage_logs` (e.g., "3/25 SerpApi today", "Lockdown active").

---

## Stage 5 — Awareness tab → Local Intelligence Map

Rebuild `AwarenessSurface`:
- Top Local Status Bar (place · time · weather · mode · freshness · cached/live · confidence).
- Central stylized radar/HUD panel (SVG, dark glass, subtle grid, pings for marker types: weather risk, nearby place, commitment, research result, calendar event, risk flag, saved place, system alert).
- Top Signals stack (3–5 items with per-signal actions: open source, ask Vanta, save to memory, create commitment, draft action, Sherlock, dismiss, snooze).
- Timeline strip (next hours, calendar + weather windows + deadlines).
- Research & Briefing History (only when relevant).
- Awareness command input (routes through Companion engine, obeys guard).
- Click marker → slide-in detail panel (not giant modal).

Day-1 radar is stylized, not a real map. Map renderer is explicitly deferred.

---

## Stage 6 — Research as first-class objects

- New tables: `research_objects` (title, question, type, summary, confidence, sources jsonb, provider_calls_used, related_place/project/person, suggested_next_steps, created_at) and `research_sources`.
- New edge function `research-run` (guarded, gated by mode + kill switches + per-task call cap): classifies request type → SerpApi (via backend) → Gemini structured summary → saves object.
- "Deep research" requires explicit user confirmation (the type-to-confirm pattern reused from high-risk actions).
- Research result card actions: save to memory / create note / create commitment / create action draft / Sherlock / add as awareness marker / dismiss / snooze. None execute.

---

## Stage 7 — Companion Widget awareness + research

- Add context-aware tool drawer: "Ask About Area" (Awareness), "Explain Receipt" (Audit), "Find Related" (Memory), "Explain/Edit Draft" (Actions).
- Companion can query snapshot, trigger guarded research, propose drafts. All execution still goes through Approve.

---

## Stage 8 — UI/UX polish + animation

- Radar sweep on refresh (one sweep, not seven).
- Soft panel slides, marker pings only when relevant, timeline drift, approval state transitions (Draft → Approved → Running → Receipt).
- Cache badge, dimmed-stale chips, glow on "relevant now", warning ring on risk.
- Tighten design tokens (depth, signal, motion, hierarchy, restraint). No neon, no spinning borders.

---

## Stage 9 — Mobile pass

- Awareness → full-screen radar sheet, bottom timeline, swipeable signal panel, bottom companion input.
- Companion → bottom drawer with thumb-friendly tools.
- Settings/API Controls → mobile-readable with prominent kill switch.
- Command Center stacks: compact awareness · status · focus · approvals · today · mini radar · captures · receipts.

---

## Technical notes

- **External providers needed:** SerpApi (secret), Open-Meteo (no key), Google Calendar OAuth (later — Stage 6+). Gemini stays on Lovable AI Gateway. I'll request `SERPAPI_KEY` via the secrets flow when Stage 1 lands.
- **RLS:** `system_controls`, `usage_limits`, `api_usage_logs`, `api_cache`, `research_objects`, `research_sources`, `awareness_snapshots` all owner-scoped. Owner role added to `app_role` enum.
- **No new client→provider calls.** Everything routes through edge functions behind `apiGuard`.
- **`config.toml`:** new functions deploy with default settings; `research-run` and `awareness-snapshot` keep `verify_jwt = true`.
- **Realtime channel fix pattern:** continue using unique channel suffix to avoid the StrictMode subscribe-twice error we already hit.
- **No autonomous loops.** `blockLoopingTask` enforces per-task call cap; no "keep searching until satisfied."

---

## Recommended execution order

Stages are designed to be approved and shipped in safe batches:

1. **Stage 1 alone** — the leash must land before any new external API exists. Needs `SERPAPI_KEY` secret.
2. **Stages 2 + 3 together** — snapshot + provider wiring, no UI change yet.
3. **Stages 4 + 5 together** — Command Center mini-radar + Awareness tab rebuild.
4. **Stage 6 alone** — research objects (touches schema + new flow surfaces).
5. **Stages 7 + 8 + 9 together** — polish batch.

If you'd rather collapse further (e.g., 1+2+3 in one go) say the word — but Stage 1 should never ship in the same batch as anything that *uses* the leash, so it can be tested in isolation.

Ready to start with Stage 1 when you approve.
