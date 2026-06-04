# Operational Briefing + Sherlock — Intelligence Layer Pass

This plan turns the doctrine document into something we can actually ship without rebuilding Vanta. It builds on what we already shipped (`src/lib/plainEnglish.ts`, `AftermathFooter`, scope-aware briefing) and extends it where the doctrine is unmet.

Constraints we will honor throughout: no autonomous execution, filter→analyze→render→summarize→display order, RLS-first, raw event codes only in Audit/source trails, mobile 384px target, calm voice.

---

## Wave 1 — Renderer becomes the "meaning" object

Expand `src/lib/plainEnglish.ts` from a string formatter into the shared output model the doctrine calls for. Every surface consumes the same shape.

New exported type:

```text
PlainItem {
  title, description,
  subject, verb, object, when, status,
  whyItMatters, nextMove, tapBehavior,
  sourceLabel, sourceTrail[],
  sensitivity, confidence?, scope?
}
```

Add typed builders for the row shapes we already pass around:
- `humanizeCapture(routeRow)` — covers Telegram / file / field_note / companion
- `humanizeReminder(commitmentRow)` — adds "overdue / due today / snoozed n×"
- `humanizeFile(ingestedFileRow)` — type guess + "needs routing"
- `humanizeNote(noteRow)`
- `humanizeExternalSignal(externalRow)` — strips `gth.booking.state_changed` → "Booking moved from pending → confirmed"
- `humanizeSherlock(finding)` — "Possible connection found", confidence words

Plain-English event-code map lives here (lookup table, not regex soup):
- `gth.booking.state_changed`, `gth.guest.message`, `gth.maintenance.created`
- `campcore.waiver.submitted`, `campcore.member.request`, `campcore.class.changed`
- `fenrir.security.event`, `fenrir.access.event`
- `telegram.message`, `telegram.file`, `email.attachment`, `forms.submission`

Confidence words: `likely match | possible match | weak match | needs review | repeated pattern | no action needed`.

Surfaces switched onto the typed object (no visual redesign, just swap the data):
- `OperationsBriefingPanel` source trail items
- `CapturesView` cards
- `SherlockFindingCard`
- `ConnectedAccounts` channel rows
- `useIntakeFeed` consumers (Live Capture rendering)

---

## Wave 2 — Briefing leads with a verdict

Rewrite the briefing payload + UI so the top line is meaning, not counts.

### Edge function `briefing-compose`
Replace the current `best_first_move` block with a structured output:

```text
{
  verdict: string,            // one-line plain English
  what_changed: string[],     // 1–3 lines
  what_matters: string[],     // 1–3 lines
  useful_connections: [...],  // from Sherlock, max 3
  best_first_move: { label, target_kind, target_id, why },
  source_grounding: { gth, campcore, fenrir, telegram, files, reminders, sherlock },
  sections: { people, operations, time, files, notes, sherlock, integrations, system }
}
```

Prompt rewrite rules (encoded in the function, not the model alone):
- Never lead with a count. `counts.external_signals` is metadata, not headline.
- If nothing notable: `"Everything is calm."` + section breakdown.
- AI is only allowed to compose the verdict + `what_matters` strings from already-filtered rows. We do not let it see raw scope-excluded data.

### `OperationsBriefingPanel`
- Top: verdict (large), source-grounding chip row ("Based on: 2 GTH · 1 Telegram · 1 reminder").
- Middle: collapsible sections (People, Operations, Time, Files, Notes, Sherlock, Integrations, System — last only when role allows).
- Bottom: single primary `AftermathFooter` with the best first move; secondary moves behind "More".
- Kill the "10 from X" pattern entirely.

### Empty / quiet states
Friendly copy from doctrine: "Nothing important in your lane right now.", "Connected platforms are calm.", "Sherlock found no useful connections."

---

## Wave 3 — Sherlock as a quiet relationship layer

Sherlock stops being a tab people don't understand; it feeds the briefing and the row hints.

### Backend
- `sherlock-watch` (cron / on-insert trigger) extends scope from current single-source to a relationship sweep: captures ↔ files ↔ reminders ↔ notes ↔ external signals, scoped by the same scope rules briefing-compose uses (personal / workspace / admin).
- Findings already have `sensitive_flag` + lifecycle helpers — add `expires_at` for low-confidence so the board doesn't pile up.
- New helper on `briefing-compose` pulls top-N `pending` findings into `useful_connections` (max 3, dedup by source pair).

### Frontend
- Embedded Sherlock hints already exist via `EmbeddedSherlockFindings`. Add a compact one-line variant (`SherlockHintChip`) for Live Capture rows and connected-account cards — "May relate to open maintenance ticket".
- User-facing wording avoids the word "Sherlock" as the leading label. "Possible connection found" / "Pattern noticed", with a small "Detected by Sherlock" trailing label.
- Confirm Plan→Approve→Execute: Accept on a finding still opens the review modal; only "Review", "Compare sources", "Dismiss", "Approve link", "Create reminder/action draft" are exposed. No auto-link of sensitive items.

---

## Connected-account cards
Pull live counts the same way the briefing does (already scoped):
- "Telegram captured 3 items today. 1 still needs routing."
- "GTH sent 5 signals. One guest-facing item needs review."
- "CampCore is calm. No open waivers."

Reuses `humanizeChannel` + new counts query in `ConnectedAccounts.tsx`.

---

## Permissions / RLS doctrine
- All new queries (briefing sections, Sherlock sweep, connection counts) go through the existing scope resolver. No new tables, no new policies needed — we are widening reads on tables that already have RLS.
- Cross-workspace Sherlock links require the user to be a member of both orgs; otherwise the link is suppressed before render.
- Admin/system section is gated by `useRole`.

---

## Out of scope for this pass
- WhatsApp integration
- New audit surfaces (we keep raw event codes there)
- Visual redesign of Live Capture, Notes, Reminders — only the strings change
- Cross-platform security correlations beyond what Fenrir already exposes

---

## Acceptance checklist (subset of the 30 in the doc)
- Briefing leads with verdict + source grounding, no counts as headline.
- Every Live Capture row reads as plain English; raw codes only in source trail.
- Sherlock findings carry: title, what noticed, why matters, confidence word, next move, source grounding.
- `AftermathFooter` present on briefing items, captures, files, reminders, Sherlock, connected cards — none execute.
- Scope filtering happens before AI sees rows.
- Mobile 384px stays calm; sections collapse.

---

## Suggested build order
1. Wave 1 renderer expansion + swap-in across existing surfaces (one PR-worth).
2. Wave 2 briefing payload + panel rewrite.
3. Wave 3 Sherlock sweep + hint chip + briefing wiring.
4. Connected-account counts polish.
5. QA pass at 384px with seeded data on each scope (personal / workspace / admin).