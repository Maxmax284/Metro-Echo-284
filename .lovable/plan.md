
# Vanta V3 — Stage 0 Audit + Phased Plan

Confirmed: nothing in the V3 spec needs to be built from scratch. Every system already has a foundation — V3 is **wiring, refactor, and visual upgrade**, not new construction.

---

## What exists and works (do NOT rebuild)

| Spec area | Already built | Status |
|---|---|---|
| Capture→Draft→Approve→Execute→Receipt→Audit law | `actions` + `action_events` + `audit_log` + `actions-execute` / `actions-transition` edge fns | ✅ Solid |
| API leash / guard | `supabase/functions/_shared/apiGuard.ts` (270 LOC, kill switches + modes + cache + rate limits + task cap + usage log) | ✅ Solid |
| System controls (kill switches) | `system_controls` table with 11 toggles + `useSystemControls` hook + owner-only RLS | ✅ Solid |
| Settings / API Control Room | `src/pages/Settings.tsx` (kill switches, lockdown, usage_limits editor, mode) | ✅ Solid |
| Awareness data model | `awareness_places` / `awareness_snapshots` / `awareness_briefings` + `AwarenessProvider` + 3 edge fns | ✅ Data layer solid; UI weak |
| Companion shell | `CompanionWidget` + `CompanionContext` + `CompanionTools` (4 tools) + `CurrentContextProvider` | ⚠️ Shell exists, toolbelt thin |
| Sherlock | `investigations` + `investigation_findings` + `SherlockProvider` + `SherlockOverlay` + `AnalyzeButton` + `sherlock-investigate` edge fn | ⚠️ Scoped overlay exists; SherlockSurface is text-box-only |
| Memory | `notes` + `note_links` + `memory-autolink` + `memory-search` + embeddings | ⚠️ Notes-app feel, needs substrate framing |
| Research objects | `research_objects` + `research_sources` + `research-run` + `ResearchPanel` | ✅ Just built last loop |
| Cockpit / MiniRadarStrip | `CommandCenterSurface` + `MiniRadarStrip` with SerpApi pill | ✅ Solid, just needs top-signal chips |
| Files | `ingested_files` + `files-ingest` + `FileUploadCard` | ⚠️ Lives in Settings, needs to surface in Companion |
| Telegram capture | `telegram-webhook` + `telegram-link` (capture-only, no execution) | ✅ Matches "messaging feeds, doesn't control" law |
| Roles | `user_roles` + `has_role()` SECURITY DEFINER | ✅ Correct pattern |

**Conclusion:** the V3 spec describes an architecture that is **~70% built**. The remaining 30% is UX upgrade + tool registry + Awareness HUD reskin. No new core tables needed except optionally a `tool_registry` config (and that can be in-memory TS).

---

## What's placeholder / weak (real work)

1. **CompanionTools** — only 4 hardcoded prompt buttons. The spec wants a registry of ~25 tools, surface-aware, mode-gated, permission-gated, API-availability-gated.
2. **AwarenessSurface** — list of places + modal with "Generate" buttons. No radar visual, no pings, no source chips on the surface itself, no top-signals strip.
3. **SherlockSurface** — single text box. The overlay (`AnalyzeButton` → `SherlockOverlay`) already supports scoped investigation; the surface itself doesn't expose modes or scoped targets.
4. **MemorySurface** — works but framed as notes. No type filters (person/place/project/finding/signal), weak empty state.
5. **Conversation tab** — still in primary nav (`PRIMARY` array in SurfaceTabs). Spec says demote to overflow/Companion Log.
6. **Street Signal layer** — Reddit/HN/Wikidata/Nominatim entirely missing. Source hierarchy not codified anywhere.
7. **File upload in Companion** — `FileUploadCard` exists but only inside Settings. Companion has no attach button.

---

## What is duplicated (must NOT make worse)

- `ConversationSurface` is rendered **both** as a route tab AND inside `CompanionWidget` body. This is the only real duplication. Fix during Stage 2 by making Companion the canonical conversation host and the tab becomes "Log" (read-only-ish history view).
- Nothing else is duplicated. Previous loops correctly extended existing tables (research_objects, awareness_snapshots) instead of forking.

---

## What must NOT be touched

- `apiGuard.ts` contract — every new tool plugs into it, never bypasses.
- `actions` table + transition flow — Companion/Awareness/Sherlock only create drafts.
- `system_controls` schema — already has every toggle the spec asks for.
- `src/integrations/supabase/client.ts` and `types.ts` — auto-generated.
- Telegram webhook execution boundary — capture only.

---

## Phased plan (build order)

```text
Stage 1 — Tool Registry        [foundation; everything else depends on it]
Stage 2 — Companion Toolbelt   [attach/voice/slash + registry-driven tools + demote Conversation]
Stage 3 — Awareness HUD        [radar canvas + pings + top signals + drawer]
Stage 4 — Sherlock scoped      [modes + target cards on surface, reuse overlay]
Stage 5 — Memory substrate     [type filters + structured empty state + linking UI]
Stage 6 — Street Signal        [Reddit + source hierarchy through apiGuard, behind kill switch]
Stage 7 — Motion + mobile pass [radar sweep, ping pulse, drawer slide; 384px audit]
```

Each stage = one approved sub-plan. We do NOT build ahead.

---

## Stage 1 — Shared Companion Tool Registry (this is what I'll implement first if you approve)

**New file:** `src/lib/companionTools.ts`

A single TS registry declaring every tool with the metadata the spec demands (id, label, icon, surfaces, modes, role, edge fn, costs_credits, provider, rate-limit category, creates_draft, needs_approval, output_route, audit_event, disabled_reason resolver).

**Refactor:** `CompanionTools.tsx` reads from the registry and filters by:
- current surface (`useCurrentContext`)
- current mode (`useMode`)
- owner status (`useIsOwner`)
- live API availability (`useSystemControls` — checks the relevant kill switch + `external_apis_enabled` + lockdown)

Disabled tools render with a tooltip explaining *why* ("SerpApi paused in Control Room", "requires Operator mode", "owner-only").

**Initial registry (12 tools, all already wired to existing edge fns):**
- Ask about area · Explain receipt · Find related · Explain draft (existing 4)
- Save to Memory · Create commitment · Draft action (route to existing tables)
- Run Sherlock (calls `openSherlock` with freeform scope)
- Research this (opens `ResearchPanel` with prefilled question)
- Summarize page · Translate · Analyze file (route to `vanta-converse` / `notes-assist`)

**No new tables. No new edge functions. No new providers.** Pure refactor + extension of what's there.

### Files touched in Stage 1
- `src/lib/companionTools.ts` (new, ~150 LOC)
- `src/components/companion/CompanionTools.tsx` (refactor to read registry)
- `src/components/companion/CompanionContext.tsx` (add `runTool(toolId)` helper if needed)

### What Stage 1 does NOT touch
- No DB migrations.
- No edge function changes.
- No Awareness/Sherlock/Memory surface changes.
- No nav changes (Conversation demotion is Stage 2).

---

## Confirmation on "no double building"

I cross-checked every spec section against the existing codebase before writing this plan. The only true duplication is `ConversationSurface` being rendered in two places, and that's resolved by Stage 2's demotion (not a rebuild — same component, different mount point + reduced nav weight). Every other "new" V3 capability is either:
- **already built** (just needs to be referenced from the registry), or
- **purely additive** (radar canvas overlay, Reddit provider) with zero overlap to existing systems.

Approve this plan and I'll execute Stage 1 only. We re-plan before each next stage.
