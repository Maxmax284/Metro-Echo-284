## Goal

Turn the dashboard from a tile grid of counts into a calm shift-report:
**Pulse → Aware (collapsed) → Operations Briefing → Live Capture → everything else.** No new integrations, no autonomous actions, no Audit/Aware rewrites.

Scope is `src/components/surfaces/CommandCenterSurface.tsx` + a new briefing panel + a thin reuse of the existing `briefing-compose` edge function. Roles already exist (`user_roles` + `has_role`, `useIsOwner`), so role gating is real — not staged.

---

## What changes

### 1. Dashboard layout (CommandCenterSurface)

New top-to-bottom order:

```text
[ Productivity Pulse ]
[ Aware bubble — collapsed by default ]
[ Operations Briefing — NEW, plain English ]
[ Live Capture — unchanged content, just relocated above the tile grid ]
[ Approvals / Today / Sherlock / Memory / Files / Receipts ]   ← existing tiles, demoted
```

- Remove the current `AmbientSummary` "counts string" card (its job is taken over by Operations Briefing).
- Pull `LiveCaptureCard` out of the grid into its own row labeled **Live Capture · receipt roll** so the receipt-roll role is visually distinct.
- Tile grid stays as the "deep dive" layer below.

### 2. Aware bubble — collapsible

- Refactor `AwareCockpitCard` into a compact one-liner: `Ko Samui · Search on · cached · Open Aware`.
- `Collapsible` (shadcn) wrapper, collapsed by default, state persisted in `localStorage` (`vanta.aware.expanded`).
- Expanded view keeps current content but trims long Timing/Hazards paragraphs — those stay in the Aware surface.
- Reads from the same `useAwareness()` provider. No duplicate state.

### 3. Operations Briefing panel (new)

New file: `src/components/cockpit/OperationsBriefingPanel.tsx`.

Renders:

- Headline (1 line, Vanta voice).
- 1–2 sentence narrative.
- "Based on:" source-grounding line with chip counts (`2 captures · 1 commitment overdue · 1 file to triage`).
- Best-first-move pill.
- Actions: **Review** (opens related surface), **Why this matters** (expands a panel listing the source rows), **Refresh briefing**, **Dismiss** (session-only).
- Footer: `Updated 8 min ago · 3 new signals since last viewed` + mode switch (Quick / Full / Mobile compact).

Modes:

- **Quick** (default on mobile and small screens): headline + best-first-move + source line. ≤3 sentences.
- **Full**: above + per-source sections (GTH, CampCore, Telegram, Files, Sherlock, etc., shown only when role permits and signals exist).
- **Mobile compact**: identical to Quick at <480px, one primary button.

Manager/Admin/Coach/Viewer "modes" are framed as **role filters applied automatically**, not a mode dropdown — Owner sees integration-health line, others don't.

### 4. AI + caching (reuse `briefing-compose`)

The existing `supabase/functions/briefing-compose/index.ts` already produces `{ headline, counts, best_first_move, narrative, items }` with Vanta voice and source counts. We extend it minimally:

- Add `role` and `scope` to the input. Server resolves role via `has_role(auth.uid(), …)` and drops sources the role can't see **before** querying (permission-safe-first, not redact-after).
- Add a `signals_hash` (sha256 of `{latest commitment updated_at, latest file id, latest message id, latest sherlock id, role}`) to the response.
- Client cache (`react-query` or local state) keyed on `signals_hash`. If the hash matches the last view, **do not call AI** — show cached narrative + "No new signals since last briefing."
- Triggers: surface open (once per session if hash changed), manual Refresh tap, role switch. Never on render or focus.
- AI-unavailable fallback already exists (deterministic `headline` + `best_first_move`) — surface it explicitly: `AI summary unavailable. Showing basic counts.`
- Audit row already emitted (`briefing.composed`). Add `briefing.viewed`, `briefing.refreshed`, `briefing.dismissed` from the client.

### 5. Role gating (uses what's there)

- `useIsOwner()` already exists. Add `useRole()` hook returning `'owner' | 'manager' | 'worker' | 'viewer' | 'personal'` by reading `user_roles`. Falls back to `'personal'`.
- Owner sees: integration-health hint in briefing, ROS Pulse tile, system-receipts tile.
- Manager sees: workspace signals only, no secrets/integration health.
- Coach/Viewer: narrowed briefing, no Approvals tile, no Receipts tile.
- Today, the project is effectively single-user/owner, so non-owner branches render but mostly stay empty until workspaces exist. **No new role rows are created in this pass.**

### 6. Live Capture rule

Zero changes to `LiveCaptureCard` content/behavior or `messages`/`ingested_files` queries. Only its position in the layout changes.

### 7. Mobile (384px target)

- Briefing panel: single column, headline truncates at 2 lines, best-first-move is the only primary CTA.
- Aware bubble stays collapsed.
- Tile grid collapses to 1 column (already true).
- No horizontal overflow; verify with the 384px viewport.

---

## Technical notes

**Files added**

- `src/components/cockpit/OperationsBriefingPanel.tsx`
- `src/hooks/useRole.ts`

**Files edited**

- `src/components/surfaces/CommandCenterSurface.tsx` — reorder, drop `AmbientSummary`, hoist Live Capture, mount briefing panel.
- `src/components/shell/AwareCockpitCard.tsx` — collapsible wrapper + trimmed expanded content.
- `supabase/functions/briefing-compose/index.ts` — accept `role`, filter sources by role, return `signals_hash`, accept `if_match` to short-circuit when hash unchanged.

**Untouched**

- Live Capture data path.
- Audit surface.
- Aware surface (full tab).
- Integration secrets / webhook code (the GTH thread we just finished).
- Plan→Approve→Execute flow. All briefing actions open drafts or surfaces; nothing executes.

**Out of scope (explicitly)**

- Workspaces table, org switcher, invites.
- WhatsApp, calendar write-back, payment execution.
- New autonomous actions.
- Productivity scores / streaks / gamification.

---

## Acceptance

- Dashboard order is Pulse → Aware (collapsed) → Briefing → Live Capture → tiles.
- Briefing renders headline, narrative, "Based on:", best-first-move, last-updated, refresh.
- Refresh does not call AI unless `signals_hash` changed.
- AI-off path shows the deterministic fallback, not a blank card.
- Owner sees integration-health line; non-owner does not.
- Live Capture content unchanged.
- 384px: no overflow, one primary CTA visible.
- Audit log gets `briefing.composed/viewed/refreshed/dismissed` rows.