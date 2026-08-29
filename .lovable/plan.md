# Sherlock: teach it, explain it, drill into it, and get a weekly read

Five additions to the Sherlock room. None of them let Sherlock do anything new — they make what it already does teachable, explainable, and tunable.

## 1. Teach it: helpful / not right on every finding

Every finding card gets two compact buttons: **Helpful** and **Not right**. One tap, no dialog, no stars.

- Writes to the existing corrections store (the same one the platform already uses for feedback), stamped with the finding, its type, and its confidence at the time.
- "Not right" also shortens that finding's future welcome: the same finding type on the same object goes quiet for the cooldown period instead of coming back next scan.
- The card shows a small "noted" state after the tap, so you never wonder whether it landed.
- Feedback is a signal, not an execution: it never accepts, dismisses, or files anything on your behalf.

## 2. Explain it: "Why this triggered"

Each card gains a collapsible **Why this triggered** section, written in plain English, built only from what the scanner actually recorded:

```text
Why this triggered
  · You promised this by Friday 5:00 PM (read from the commitment)
  · That slot is inside "Lamai staff sync" (read from your calendar)
  · Confidence: certain — both records say so directly
  Vanta did not read anything else to decide this.
```

Rules it follows:
- Every line names the record it came from. No line appears without a record behind it.
- Confidence reads as words (certain / likely / uncertain), never a percentage.
- When the scanner recorded nothing beyond the summary, the section says so instead of padding with guesses.

## 3. Drill down: the items behind a finding

Tapping a finding opens a drawer that lays out the underlying items by category:

- **Notes** — the notes involved, with a snippet and a link to open them
- **Actions** — any draft or executed action tied to the same object
- **Calendar** — the meeting involved, read-only, with its real time
- **Inbox** — the capture or file the trail started from
- **Also linked** — connections you or Vanta made to the same object

Each row opens the real desk for that item. Empty categories say what would land there rather than showing a blank column. Nothing in the drawer executes.

## 4. Weekly read: the Sunday-night Sherlock digest

Once a week, Vanta composes a digest from your own records:

- What is new since last week, grouped by kind
- What you accepted, dismissed, or marked wrong (so the digest reports a diff, not a status)
- The handful of items still worth a second look, ranked
- One honest line when the week was quiet — "nothing repeated this week" is a valid digest

Where it shows up:
- **In Sherlock** — as a card at the top of the room, saved alongside your other briefs so you can reread or export it
- **On Today** — one line, once a week, so you see it without opening Work
- **On Telegram** — off by default, opt-in, and quiet-hours aware

All three are switchable in settings. The digest is assembled from records only, so it costs nothing to run and cannot invent a finding that isn't there.

## 5. Tune it: detection settings that cannot widen power

A new **Detection sensitivity** section in the Sherlock controls panel, owner-only, one set of settings used everywhere:

- Per-detector on/off switches (promise past due, duplicates, keeps coming up, promise clashes with a meeting, went quiet, two notes disagree, document promises, open risks, meetings with no context)
- How overdue a promise must be before it is worth mentioning
- How many mentions count as "keeps coming up"
- How long silence counts as "went quiet"
- How far ahead to look for calendar clashes
- The dismissed-cooldown period, moved in beside the rest

The panel only changes what Sherlock notices and how loudly. It cannot grant Sherlock permission to file, link, message, or execute anything — those paths stay behind your approval, unchanged.

---

## Technical notes

**Current state confirmed:** `sherlock_settings` today holds only booleans plus `dismissed_cooldown_days` — no threshold columns exist. `SherlockFindingCard` has no feedback control (the existing `FeedbackBar` is only on investigation findings). `cron.job` has a nightly `sherlock-patterns` job and no digest job. `brief_exports` already stores composed artifacts.

**Feedback (1).** Reuse `corrections` (`surface: "sherlock"`, `target_type: "sherlock_finding"`, `feedback_type: useful | wrong`, `confidence_impact`). New compact `FindingFeedback` control rather than the full six-button `FeedbackBar`, which is too heavy for a card. "Not right" sets `cooldown_until` on that finding through the existing lifecycle helper.

**Why this triggered (2).** New pure module `src/lib/sherlockWhy.ts`: `explainFinding(finding)` maps `finding_type` + `extracted_data` to labelled signal lines, reusing `confidenceBand`/`describeRead` from `src/lib/confidence.ts`. Unknown keys are dropped, never rendered raw. Unit-tested per detector type.

**Drill-down (3).** New `SherlockEvidenceDrawer.tsx` plus `src/hooks/useFindingEvidence.ts`. Resolves `source_object_type/id` and `target_object_type/id` into typed rows through `applyScope`, and calls the existing `cross_links_for_item` RPC for adjacent links. Read-only queries only.

**Digest (4).** New edge function `sherlock-digest` on a weekly `pg_cron` job, following the background-job contract: bounded per-run row caps, a single-flight lease, idempotency on `(user_id, organization_id, week_start)` so a re-run never writes a second digest, and no AI-gateway call at all (deterministic composition from `sherlock_findings` + `audit_log`). Stored in `brief_exports` with a `sherlock_week` scope kind. Telegram delivery reuses the existing unified delivery pipe and the awareness quiet-hours check. Today's line reads the latest digest row; no new store.

**Settings (5).** Migration adds nullable-with-default columns to `sherlock_settings`: per-detector booleans, `stale_promise_days`, `duplicate_window_days`, `recurring_min_mentions`, `quiet_gap_days`, `meeting_lookahead_hours`, plus `weekly_digest_enabled` / `weekly_digest_today` / `weekly_digest_telegram`. `sherlock-patterns` reads them per user, clamped server-side to safe ranges so a bad value cannot make it scan wider than the room or spam the queue. Panel gated by `useIsOwner`. `useSherlockSettings` and the generated types get the new fields.

**Doctrine held throughout:** every read scope-filtered, every card keeps its aftermath line, empty states teach, no new room, no second chat surface, and nothing here executes without your approval.
