# Vanta Awareness + Global Voice — Audit & Staged Plan

Per the prompt's "Audit Before Building" rule, this plan opens with the audit, then stages the work. Nothing executes yet.

## Audit — what's actually in the code today

**Awareness surface (**`src/components/surfaces/AwarenessSurface.tsx`**)**

- HUD is already mounted at the top (good — V3 work).
- Below the HUD: a "Quick generate" chip row (Transport, Infrastructure, Payments, Etiquette, Hazards, Scams, Connectivity, Timing). These are still **freestyle prompt buttons**, not radar filters. Each chip directly calls `generate(section)` → `awareness-brief` edge function.
- Place capture ("Use here") and place list are still the dominant column under the HUD — radar is not the page.
- Detail modal renders `b.content` as `whitespace-pre-wrap` Markdown-ish text with a single "confidence:" footer. **Raw Markdown leaks here.** Long paragraphs, no drawer.

**Awareness HUD (**`src/components/shell/AwarenessHUD.tsx`**)**

- V3 work landed: radar pings, pinning, tier hierarchy (Official/Local/Community/Web/AI), kill-switch awareness, Reddit hybrid fetcher wired through `awareness-snapshot`.
- Drawer exists, but ping payload is just the snapshot's `compact` text — no structured signal schema yet.
- Header now wraps on 384 px (V3 stage 7).

**Edge functions**

- `awareness-snapshot` — already structured, multi-source (weather, SerpApi, Reddit SerpApi/public fallback), tiered. Good base.
- `awareness-brief` — **the bottleneck**. System prompt asks Gemini for "under 180 words" prose ending in `confidence: …`. No JSON schema, no source labels, no `why_it_matters`/`what_to_do_next`/`requires_confirmation`. Output is the wall of text the prompt complains about.
- `awareness-query` — same shape, prose-only.
- No global voice/tone shared module on the server or client.

**Other surfaces (touched lightly to confirm)**

- Companion, Sherlock, Memory, Notes, Telegram, Actions, Audit all have their own ad-hoc prompts. No shared Vanta voice layer.

**Weird-location handling**

- `awareness-snapshot` reverse-geocodes but does not flag offshore / impossible / stale GPS. HUD has no `location_warning` signal type.

**API safety**

- `apiGuard` exists with kill-switches + caching for SerpApi + Reddit. No per-feature owner override panel.
- No paid call on render — snapshot only runs on refresh/active-place change. OK.

**Markdown rendering**

- Briefing detail uses `whitespace-pre-wrap`. `**bold**` and `-` bullets leak through verbatim.

## Plan — 5 stages, each independently shippable

### Stage 1 — Structured Awareness Signal schema + voice module (foundation)

- New `supabase/functions/_shared/vantaVoice.ts`: shared system prompt fragments + a `VantaSignal` Zod schema matching the prompt's spec (`signal_type`, `confidence`, `source_labels`, `freshness`, `why_it_matters`, `what_to_do_next`, `requires_confirmation`, `available_routes`, etc.).
- New `src/lib/vantaSignal.ts`: matching TS type + renderer helpers (compact card, drawer sections, chip mappers).
- New `src/lib/markdown.ts` (tiny): strip-or-render utility so no surface dumps raw `**` again.
- No UI/behavior changes yet — pure scaffolding the rest of the stages consume.

### Stage 2 — Awareness backend → structured signals

- Refactor `awareness-brief` to:
  - Call Gemini with `response_format: json_schema` (or guarded JSON-mode) bound to `VantaSignal`.
  - Inject Vanta voice system prompt from the shared module.
  - Validate, persist structured JSON alongside `content` (store in `awareness_briefings.signal jsonb`).
  - Migration: add `signal jsonb` column (nullable, backfill skipped).
- Add **weird-location detection** in `awareness-snapshot`: emit a `location_warning` signal when GPS is offshore (no reverse-geocode hit), stale, or single-point low-accuracy.
- Both functions emit `source_labels` + `freshness` + `requires_confirmation` natively.

### Stage 3 — Awareness UI: radar-first, structured-render

- `AwarenessSurface`: demote place list, promote HUD; replace "Quick generate" chips with **radar layers** (tap = filter pings + show layer summary card, not a generate button).
- Rename `Generate` → operational verbs (`Scan`, `Refresh Signal`, `Verify Location`, `Pull Sources`).
- HUD ping click → drawer renders `VantaSignal` properly: title, 1-line summary, confidence chip, source chips, freshness, why-it-matters, what-to-do-next, route buttons (Ask Vanta, Save to Memory, Send to Sherlock, Create commitment, Draft action, Refresh, Dismiss).
- Detail modal: short compact card by default, `View full report` toggle for `long_detail`.
- Markdown gets rendered cleanly (no more raw `**`).
- Location-warning signal pinned to radar with confirm/use-saved-place actions.

### Stage 4 — Global Vanta voice rollout

- Apply shared voice module to: `vanta-converse`, `sherlock-investigate`, `memory-search`/`memory-autolink`, `notes-assist`, `research-run`, `telegram-webhook`, `commitment-reminders`, `actions-execute` explanations.
- Each surface gets surface-specific flavor (Companion / Sherlock / Memory / Actions / Audit / Telegram / Intake) from the shared module — same family, different accent.
- Companion widget gains route handlers so it can "Explain this Awareness signal" using the structured signal payload.

### Stage 5 — Cross-surface routing + Cockpit/Audit alignment

- Awareness signal → Memory / Sherlock / Commitments / Actions draft routes wired end-to-end (no execution — drafts only, per Vanta Law).
- Cockpit/Command Center receives a condensed Awareness summary (top 1–3 signals + source chips + Open Awareness CTA), no big report.
- Audit gains Awareness-specific event types (`signal_refreshed`, `signal_saved_to_memory`, `signal_sent_to_sherlock`, `action_draft_from_awareness`, `api_blocked`).
- Document Intake card uses the same `VantaSignal`-shaped renderer for parity.

## Out of scope (intentionally)

- New tables beyond `awareness_briefings.signal jsonb`.
- Any execution paths (Vanta Law preserved).
- Auto-refresh loops or page-render paid API calls.
- Replacing the existing apiGuard kill-switches — they already do the job.

## Suggested execution

Stage 1 + 2 in one pass (they're tightly coupled and safe). Stage 3 next on its own (visible UX shift, deserves isolation). Stages 4 + 5 can ride together once voice schema is stable.

Tell me "go" and I'll start with Stages 1 + 2; or pick a different starting stage if you want to lead with the UI shift first.

&nbsp;

Before starting Stage 1 + Stage 2, please also include a small validation checkpoint after Stage 2.

&nbsp;

After "awareness-brief" and "awareness-snapshot" are producing structured signals, show sample before/after outputs for at least Transport, Hazards, Payments, Connectivity, and Location Warning.

&nbsp;

The “after” examples should prove that Vanta is speaking in the new voice: plain English, warm, concise, street-smart, source-aware, confidence-aware, and not robotic or corporate.

&nbsp;

Do not proceed into Stage 3 UI work until the structured signal output and tone examples look correct.

&nbsp;

Also verify that the new structured output does not break existing cached snapshots, existing HUD rendering, existing source badges, existing API guard behavior, or existing no-paid-call-on-render behavior.

&nbsp;

If Gemini fails to return valid JSON, use a safe fallback that does not dump raw prose into the UI. The fallback should show a short error/state card like: “I couldn’t structure this signal cleanly. Try refreshing or send it to Sherlock,” with source/cached context preserved.

&nbsp;

Keep the first pass tight: Stage 1 + Stage 2 only. No UI redesign, no new external APIs, no cross-surface rollout, no extra tables beyond the planned nullable "awareness_briefings.signal" field unless the audit proves it is absolutely necessary.