# Sherlock Cross-Analysis — Remaining UI/UX + Logic Inconsistencies

Date: 2026-08-25. Method: full-codebase cross-read of every surface against the
project's own rules (tokens only, `state-views` for loading/empty/error,
`.vanta-card` for cards, `vantaToast` for voice, `applyScope` for every scoped
read, one implementation per job).

Verdict: the rules exist and are good. Adoption is uneven. Nothing here is
broken paint — it's the same job done four different ways in four rooms.

---

## Ranked by what actually bites

### P0 — Scope bleed (logic, not looks)
`src/lib/scope.ts` says every scoped read derives from `applyScope`. These read
by `user_id` only or with no filter, so Personal and Workspace data mix in one
list:

| File | What's unscoped |
|---|---|
| `src/components/links/LinkChips.tsx:58-61` | `notes`, `commitments`, `ingested_files`, `messages` — no user or scope filter at all |
| `src/hooks/useProductivityPulse.ts:52-63` | `capture_routes`, `actions`, `commitments` — counts every org at once |
| `src/components/entities/CanvasFlowView.tsx:62,68,74` | `capture_routes`, `actions`, `audit_log` |
| `src/components/entities/CanvasTimelineView.tsx:75-94` | `commitments`, `notes`, `ingested_files` |
| `src/components/cockpit/DailyBulletinCard.tsx:101-114,157-160` | `audit_log`, `brief_exports`, `project_items`, `projects` |
| `src/components/projects/ProjectBriefView.tsx:79-83` | `audit_log` receipts, keyed on `entity_id` only |
| `src/components/memory/PrivacySettingsPanel.tsx:64-65` | `corrections`, `field_notes` — while `CorrectionsCenter.tsx:67-73` scopes the same two tables correctly |

RLS still stops another person's rows. It does **not** stop your own workspace
rows showing up in your personal room — that's the app's job and it's missing here.

### P1 — Loading, empty and error states go their own way
Only 8 files use `@/components/ui/state-views`. The rest hand-roll spinners and
write their own empty copy, which is why "the animation is there and at the same
time it isn't":

- `ActionsSurface.tsx:392,438` — inline `Loader2` on buttons
- `SherlockSurface.tsx:252,326` — spinner plus hardcoded "No investigations yet."
- `CommitmentsSurface.tsx:237` — bespoke `py-12` spinner block
- `MemorySurface.tsx:402,509,650,653,686,690` — spinners plus "No notes yet."
- `AwarenessSurface.tsx:283,324,463,472,494` — five hand-written empties
- `Auth.tsx`, `ConnectedAccounts.tsx`, `Documents.tsx`, `Index.tsx`,
  `ProjectBrief.tsx`, `Projects.tsx`, `ReconciliationView.tsx`,
  `WorkspaceStructure.tsx` — same story

Empty states here also just report emptiness instead of teaching how something
lands there, which is a doctrine miss, not only a style miss.

### P1 — Five capture lists, four project pickers
Same job, separate wiring, separate bugs:

- Capture lists: `InboxSurface.tsx`, `memory/CapturesView.tsx`,
  `inbox/InboxNotesList.tsx`, `projects/ProjectInbox.tsx`, `EmailInboxCard.tsx`
- Project attach: `AddToProjectComposer.tsx` (one call site, fully parallel
  implementation) versus the `ProjectPickerPopover` → `AttachToProjectMenu` →
  `BulkAttachToProjectMenu` family that does layer correctly
- Ask entry: `ask/AskAboutButton.tsx`, `ask/AskContextStrip.tsx`,
  `today/AskVantaBar.tsx` — three conventions into one thread system; worth
  confirming all three send the same context payload shape

### P2 — Cards
15 files use `.vanta-card`; 25 import raw `@/components/ui/card`. Raw cards on
real surfaces: `AuditSurface.tsx:255,292`, `CommandCenterSurface.tsx:388,408`
(the rest of that file uses a `CardShell`), `ScheduleSurface.tsx:187,232`,
`SherlockSurface.tsx:194,334`, `Documents.tsx:239`,
`WorkspaceStructure.tsx:206,340`, `ReconciliationView.tsx`,
`ConnectedAccounts.tsx`.

### P2 — The Feel knob doesn't reach timers
CSS-class motion scales with `--feel-k`. JavaScript timers don't, so the same
setting feels honest in one room and cosmetic in another:
`WorkspaceSwitcher.tsx:28` (900ms), `PostureGlyph.tsx:53` (520ms),
`AwarenessHUD.tsx:124` (8s), `TodaySurface.tsx:171` (800ms),
`SherlockSurface.tsx:148` (6s), `AttachToProjectMenu.tsx:49` and
`BriefRenderer.tsx:53` (1600ms). Three independent debounce magic numbers too:
`BadLocationRecoveryPanel.tsx:213` (350ms), `useIntakeFeed.ts:196` (400ms),
`AuditSurface.tsx:114` (400ms).

Shared shadcn primitives never adopted the tokens either: `accordion.tsx:31`,
`alert-dialog.tsx:37`, `dialog.tsx:39`, `sheet.tsx:32`,
`navigation-menu.tsx:52`, `sidebar.tsx:185,195,364`, `input-otp.tsx:44`.

### P3 — Colour and dead weight
- `WorkspaceStructure.tsx:354` — `text-white` on a badge, the only real token
  bypass on an app surface.
- Overlay scrims are `bg-black/80` in `alert-dialog.tsx:19`, `dialog.tsx:22`,
  `sheet.tsx:22`, `drawer.tsx:21` — four files instead of one scrim token.
- Dead components: `companion/CompanionTools.tsx` (zero imports; the used file
  is `lib/companionTools.ts`) and `shell/MiniRadarStrip.tsx` (superseded by
  `AwarenessHUD`, only mentioned in a comment).

## Clean
`vantaToast` discipline holds — nothing imports `toast` from `sonner` except the
wrapper itself. Motion vocabulary, scope contract and state-views all exist and
are used correctly where they're used at all. This is an adoption problem.

## Suggested order
1. Scope bleed (P0) — data honesty first.
2. State-views sweep, empty copy that teaches (P1).
3. Collapse the capture lists and retire `AddToProjectComposer` (P1).
4. `.vanta-card` sweep, `--feel-k` for timers, scrim token, delete the two dead
   files (P2/P3).
