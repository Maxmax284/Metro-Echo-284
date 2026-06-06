# Project-First Living Brief

Four moves, sequenced so each one stands on its own. We approve and ship in order — not all at once.

---

## 1. Projects table + Living Brief data model

A project is the new anchor. Everything (captures, notes, files, Sherlock findings) can attach to one.

New tables (single migration):

- `projects` — id, user_id, organization_id (nullable, scope-aware), title, summary, status (`active|paused|archived`), pinned, created_at, updated_at.
- `project_items` — id, project_id, item_type (`capture|note|file|finding|commitment|action`), item_id, added_at, added_by, position (for ordering inside the brief), note (optional inline annotation).

Both get GRANTs + RLS scoped via `useActiveScope` rules (personal: `user_id = auth.uid()`; workspace: `organization_id` + `organization_members`).

No edge functions, no AI calls. Pure data + UI.

---

## 2. Living Brief page

Route: `/projects` (list) and `/projects/:id` (the brief).

The brief is one scrollable page, top-to-bottom:

```text
[ Project title ]                       [ pin ] [ status ] [ ⋯ ]
Plain-English summary (editable, free text)
─────────────────────────────────────────────
Latest                what changed in last 7d
Captures              chronological, grouped by day
Notes                 attached notes, full body inline
Files                 attached files w/ extract preview
Signals               Sherlock findings tied to this project
Commitments & Actions live state pulled from existing tables
─────────────────────────────────────────────
[ + Attach items ]  [ Open in Memory ]
```

No new fancy AI synthesis in v1 — the "living" part is that attached items render inline and stay in sync. The top summary is hand-edited; we can add an AI draft button later.

---

## 3. Project-first navigation

Mobile surface order stays (per Core rule) but `Projects` becomes the default home tab. Existing surfaces don't disappear — they become filters into the brief:

- Capture card → action menu gains **"Attach to project…"**
- Note editor → footer gains **"Part of project: [picker]"**
- File row → same attach action
- Sherlock finding → same

Tapping any attached item from inside a Living Brief opens it in its native surface with a back-to-brief breadcrumb. No new modals.

---

## 4. Multi-select + glossary

**Multi-select** (the linking pain point):

- Long-press / checkbox on Capture, Note, and File lists turns into multi-select mode.
- Floating bar at the bottom: `N selected — Attach to project ▾  •  Cancel`
- One write per attach, batched into `project_items`.

**Glossary / tooltips** (the "what does this do" pain point):

- New `mem://design/glossary` doc + a `<HelpTip term="..." />` component reading from a single `src/lib/glossary.ts` map.
- Plain-English entries for: Living Brief, Capture, Note, Memory, Attach, Pin, Status, Sherlock signal, Commitment, Action, Workspace scope, Linking toggles.
- A "?" icon next to each toggle/label in Memory's related-panel, the project picker, and the surface tabs.

---

## Build order (each step is reviewable on its own)

1. Migration: `projects` + `project_items` with RLS/GRANTs.
2. Projects list + Living Brief page (read-only render of attached items).
3. "Attach to project" action on Capture / Note / File / Finding rows.
4. Multi-select mode + bulk attach.
5. Glossary map + `HelpTip` component, wired into Memory's related-panel first, then surfaces.
6. Promote `/projects` to default route, add nav entry, soft-demote competing surfaces.

---

## What this does NOT do (on purpose)

- No AI auto-summary of the brief (yet). Living = items stay in sync, not magic synthesis.
- No new capture surface. Capture stays where it is.
- No deletion or restructuring of existing surfaces — they stay as support layers.
- No changes to messaging/Telegram bridge.

Approve and I'll start with step 1 (the migration).  
  
Approved.

Proceed with the Project-First Living Brief plan exactly in the proposed build order.

Start with Step 1:

Migration for `projects` and `project_items` with proper RLS/GRANTs using the existing active scope rules.

Keep this sequenced and reviewable. Do not bundle all four moves together.

Important confirmations:

- Projects are the new anchor.
- Living Brief is the main project case file.
- No AI summaries in v1.
- No new edge functions.
- No Telegram or capture bridge changes.
- Existing surfaces stay as support layers.
- Attach-to-project comes after the migration and read-only brief page.
- Multi-select and glossary come after the core project flow works.

The goal is simplicity first:

Capture / Note / File / Sherlock finding  
→ Attach to Project  
→ Appears inside Living Brief  
→ User understands where it lives and why.

Begin with the migration only.