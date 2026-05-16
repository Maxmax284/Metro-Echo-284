# Vanta — Stages 1–8 complete

## Stage 6 — Proactive Synthesis (shipped)

- `ambient-pulse` extended with a 7-day tag-frequency pass over `notes`.
  - Skips infrastructural tags (`imported`, `upload`, `email`, `telegram`, `via:*`).
  - Emits up to 1 `synthesis_suggestion` nudge/day for the top recurring theme,
    only if no investigation in the last 7d already references that tag.
  - Priority 35 (whisper-level), expires end of day.
- `NudgesPanel` recognises the kind and adds an "Investigate" affordance that
  opens Sherlock pre-loaded with a synthesis prompt around the detected theme.

## Stage 7 — Mobile UX (shipped)

- `SurfaceTabs` (bottom variant) now shows 4 primary surfaces (Cockpit, Log,
  Commit, Actions) + a `More` sheet for Memory / Sherlock / Aware / Audit.
  Touch targets stay honest at ≤390px width.
- `AmbientHeader` tightened: state label hidden <sm, time hidden <sm,
  place pill caps at 88px on mobile / 140px on desktop, awareness pill drops
  the confidence suffix on mobile. Padding reduced on mobile.

## Stage 8 — Research & File Intelligence (shipped)

- `files-ingest` now emits a `file_insight` nudge after a successful ingest
  when extracted text ≥ 400 chars, linking back to the generated note.
- `FileUploadCard` rows for `status=done` files expose an inline "Investigate"
  button that opens Sherlock with the note's extracted body and `entity_type: "file"`.
- `NudgesPanel` `file_insight` rows route the same way — one tap to investigation.

## Status

All 8 stages of the Vanta operational-companion arc are shipped.
Companion + Awareness + Mode gates + Approval polish + Proactive synthesis +
Mobile pass + File intelligence are live. Plan→Approve→Execute remains the
only execution path; no chat surface controls the system directly.
