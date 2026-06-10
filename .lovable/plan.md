# Slice 6 — Intake Lifecycle + Command Center Declutter

Goal: stop Vanta from resurfacing old, dismissed, duplicate, or already-attached intake. Make Command Center feel current. Add a clear download button for the Verdict PDF.

No new major features. Reuse existing layers: messages, ingested_files, field_notes, project_items, audit_log, capture_routes.

---

## 1. Intake lifecycle (single source of truth)

Today: dismiss state is inconsistent. `messages.metadata.routed_to` exists, `ingested_files.review_status` exists, but there is no shared "lifecycle" field, no dismissed persistence for Command Center cards, and no stale filter.

Introduce one shared lifecycle concept stored in metadata + a small new table for cross-kind dismissals/restores.

States (UI words): **Active · Attached · Archived · Dismissed · Stale**

Mapping:
- Active = fresh, not routed, not dismissed, within visibility window.
- Attached = present in `project_items` for any project.
- Archived = explicitly archived by user (file `review_status='archived'`, message `metadata.lifecycle='archived'`).
- Dismissed = explicitly dismissed by user (new `intake_dismissals` row).
- Stale = older than window AND not attached AND not dismissed AND not in an active workflow (no open commitment / pending finding linked).

### New table: `intake_dismissals`
Small, cross-kind, append-only.
```
id, user_id, item_kind ('message'|'file'|'field_note'|'capture_group'),
item_id (uuid or group hash), dismissed_at, reason text null,
restored_at timestamptz null
```
RLS scoped to `auth.uid()`. GRANTs to authenticated + service_role.

A "dismissed" item = latest row for (user, kind, id) has `restored_at IS NULL`.

### Resurface rules
A dismissed item only comes back if:
- user restores it from the Dismissed view, or
- it gets attached to a project (auto-restore + flip to Attached), or
- a related commitment/finding becomes due.

No silent resurfacing on refresh.

---

## 2. Visibility windows + settings

Add to `profiles.preferences` (existing jsonb, no migration needed for shape):
```
intake: {
  capture_visibility_days: 3,           // 2 | 3 | 7 | custom
  unattached_after_window: 'collapse',  // collapse | archive | keep | ask
  dismissed_behavior: 'sticky',         // sticky | show_restore
  duplicate_grouping: 'group',          // group | hide_dupes | newest_only | show_all
  command_center_section_limit: 5       // 3 | 5 | 10 | custom
}
```

New settings section `IntakeCleanupSection.tsx` mounted in `src/pages/Settings.tsx` (Control Room). Plain-English copy as specified in the brief. Reads/writes via existing `useUserPreferences`.

---

## 3. Shared filter layer

New `src/lib/intakeLifecycle.ts`:
- `classifyIntakeItem(row, ctx) → 'active'|'attached'|'archived'|'dismissed'|'stale'`
- `filterForCommandCenter(items, prefs, dismissals, attachedIds)`
- `filterForInbox(items, prefs, dismissals, attachedIds, filter)` (filter = Active|Attached|Archived|Dismissed|Stale|All)
- `groupSimilarCaptures(items, prefs)` — bucket by (project hint OR top entity OR shared keyword stem) within a 48h window; output `{ kind:'group', key, items[], label }` when count ≥ 2.

New hook `useIntakeDismissals()` — loads dismissals once, exposes `dismiss(kind,id)`, `restore(kind,id)`, optimistic local set. Realtime subscribed.

New hook `useAttachedItemIds()` — single query against `project_items` returning a `Set<"kind:id">`. Cached + realtime.

---

## 4. Wire-up (no new surfaces)

Update these existing files to consume the filter + dismissals layer. No business logic changes beyond filtering/grouping/dismissing.

**Command Center** (`src/components/surfaces/CommandCenterSurface.tsx` + cockpit cards under `src/components/cockpit/`):
- Each section runs items through `filterForCommandCenter` + `groupSimilarCaptures`.
- Apply `command_center_section_limit`.
- Add a `View all / Show older` dropdown per section that opens the matching Inbox filter.
- Dismiss X on every card writes via `useIntakeDismissals().dismiss(...)`.
- Attached items are filtered out unless explicitly toggled.

**Inbox** (`src/components/surfaces/InboxSurface.tsx`, `useIntakeFeed.ts`):
- Add tab filters: Active · Attached · Archived · Dismissed · Stale · All.
- Default = Active. Dismissed/Stale views show a `Restore` button.
- Live Captures section in command center pulls from this with `filter='active'` capped by section limit.

**Capture cards** (`src/components/memory/CaptureCard.tsx`, `CapturesView.tsx`, `MemoryFilesView.tsx`, `InboxNotesList.tsx`):
- Replace local "X" handlers with shared `dismiss()`.
- When part of a group, render the group summary card (label + count + Expand / Attach to Project / Summarize together / Dismiss group). Group dismiss writes one `capture_group` dismissal keyed by group hash, with individual item ids in `reason` for receipts.

**Attached rollup**:
- `useAttachedItemIds()` is the gate. Anything in the set is hidden from Command Center and from Inbox `Active` (still visible in `Attached`, in the project, and in Memory search).

**Memory search** stays untouched — everything remains searchable regardless of lifecycle.

---

## 5. Audit + receipts

Every dismiss/restore/archive writes one `audit_log` row (`event='intake.dismissed'` / `'intake.restored'` / `'intake.archived'`) so receipts stay permanent. Group dismissals include the member ids in `payload`.

---

## 6. Verdict PDF — download button + cover page

Today the Verdict PDF was generated as an artifact, but there is no in-app download.

- Add a small `VerdictDownloadCard` in Settings → Control Room (and a button in the Briefs surface header) that links to a static `/vanta-verdict.pdf` shipped in `public/`.
- Regenerate the PDF with a **title cover page**:
  - Title: "Vanta — The Verdict"
  - Subtitle: "A calm operational brain for people who think faster than their tools."
  - One-paragraph hook (East-Coast plain English) summarizing the platform concept.
  - Generated date.
- Body unchanged from the previous Verdict (concept, capabilities, what it was built for, maturity gaps, bottom line).
- Save to `public/vanta-verdict.pdf` so the button is a plain `<a href="/vanta-verdict.pdf" download>`.

---

## Technical section

### Files added
- `supabase/migrations/<ts>_intake_dismissals.sql` — table + RLS + grants + index on `(user_id, item_kind, item_id, dismissed_at desc)`.
- `src/lib/intakeLifecycle.ts` — classify/filter/group helpers + unit tests under `src/test/intake-lifecycle.test.ts`.
- `src/hooks/useIntakeDismissals.ts`
- `src/hooks/useAttachedItemIds.ts`
- `src/components/settings/IntakeCleanupSection.tsx`
- `public/vanta-verdict.pdf` (regenerated with cover page)
- `src/components/settings/VerdictDownloadCard.tsx`

### Files edited
- `src/hooks/useUserPreferences.ts` — extend `UserPreferences` type with `intake` block + defaults.
- `src/components/memory/useIntakeFeed.ts` — accept lifecycle filter; return classified items; merge dismissals + attachments.
- `src/components/surfaces/CommandCenterSurface.tsx` + `src/components/cockpit/*` — apply filter/limit/group; wire `View all`.
- `src/components/surfaces/InboxSurface.tsx` — add Active/Attached/Archived/Dismissed/Stale tabs + restore.
- `src/components/memory/CaptureCard.tsx`, `CapturesView.tsx`, `MemoryFilesView.tsx`, `InboxNotesList.tsx` — shared dismiss + group card render.
- `src/pages/Settings.tsx` — mount `IntakeCleanupSection` and `VerdictDownloadCard`.
- `src/components/surfaces/BriefsSurface.tsx` — small "Download the Verdict" link in header.

### Out of scope
- No new AI features, no new edge functions.
- No changes to Sherlock, Living Briefs, exports, or project structure beyond reading `project_items`.
- No deletion of any data — dismissed/archived/stale are filters, not deletes.

### Acceptance tests
1. Dismiss a week-old "Laundry" capture → gone from Command Center, stays gone after refresh, still findable in Memory search and in Inbox → Dismissed (with Restore).
2. Four "Ground Stay payment" captures within 48h → render as one group "4 related Ground Stay payment captures" with Expand / Attach / Summarize / Dismiss group. After Attach to Ground Stay → group disappears from Command Center, shows inside the project, stays in Memory.
3. Toggle Settings → capture window 2 days, section limit 3 → Command Center reflects immediately.
4. Verdict button in Settings downloads a PDF whose first page is the cover (title + hook).