# Vanta E2E Test + Seeded Life Sim + Screenshot Report + Maturity Audit

## Ground rules (locked in by your answers)

- **Seeding:** every row gets `metadata.seed = true` (or equivalent tag column). One teardown script wipes it all.
- **Screenshots:** hybrid. I drive the headless browser where it works; where auth or modals block me, I drop a clearly labeled placeholder with reproduction steps.
- **Telegram / Actions:** mocked only. I insert pretend telegram updates and action drafts. No bot calls, no execution.
- **Output:** HTML (primary, dark/tactical), Markdown mirror, PDF (chromium print). All in `/mnt/documents/vanta-e2e/`.
- **Tone:** East Coast plain English. Honest. No fluff. No fake hype.

## Surfaces actually present (confirmed from repo)

CommandCenter, Awareness, Conversation (Companion), Memory, Notes (lives inside Memory/Conversation surfaces — will verify), Commitments, Sherlock, Actions, Audit, Settings. Edge functions: awareness-*, telegram-webhook, vanta-converse, files-ingest, sherlock-investigate, actions-*, memory-*, notes-assist, research-run, commitment-reminders.

No standalone Notes page — Notes appear via Memory + capture flows. The report will call this out as a maturity finding rather than invent a surface.

## Phase 1 — Seed data (tagged, reversible)

Script: `scripts/vanta-seed.ts` (run via `bun`). Single user (you). Inserts:

- **awareness_places:** Lamai Muay Thai (valid land), Lamai town, Koh Samui island, offshore bad pin (9.45, 100.2 — ocean east of Samui), saved place, manual place.
- **notes (8):** project/person/place/document/field/decision/idea/reminder-seed — each with `metadata.seed=true`.
- **commitments (4):** GroundStay update, booking issue follow-up, vendor follow-up, schedule confirm.
- **nudges/reminders (6):** rent, staff message, dog food, guest follow-up, schedule review, prep doc.
- **field_notes (3):** printer hours, road closure, vendor price.
- **ingested_files (5):** receipt, invoice, contract, visa doc, screenshot — metadata only, no real bytes.
- **actions (3):** one proposed, one awaiting approval, one executed-with-receipt — all marked seed.
- **audit_log:** event for every insert so Audit has receipts to render.
- **investigations (2):** one contradiction, one source conflict, with findings.
- **conversations + messages:** Companion thread referencing seeded items.
- **mock telegram updates:** since `telegram_messages` table isn't in schema, I'll mock by inserting into `audit_log` + `notes` with `source='telegram'` so the routing path is visible. (Will verify and adjust if a dedicated table exists.)

Teardown: `scripts/vanta-seed-teardown.ts` — `delete where metadata->>'seed' = 'true'` across all touched tables, in FK-safe order.

## Phase 2 — Scenario runs

For each of the 17 scenarios in your prompt:

1. Pre-condition (seed state) → 2. Trigger (UI action or simulated event) → 3. Observe (DB rows, network, console, screenshot) → 4. Verdict (pass / partial / fail) → 5. Notes.

Auto-driven scenarios (browser tool): Command Center load, Awareness valid + bad-pin recovery, Memory page, Commitments page, Sherlock, Actions list, Audit, Settings, mobile breakpoints (390x844, 360x800).

Manual/placeholder scenarios: Telegram interactions (mocked rows shown in Audit), real PWA install prompt, file upload with real bytes, action execution receipt.

## Phase 3 — Screenshots

- `screenshots/auto/*.png` — captured live, 1280x720 + 390x844.
- `screenshots/placeholder/*.md` — labeled stub with what should be there + reproduction steps.
- Each screenshot gets caption, what-tested, pass/fail, improvement note.

## Phase 4 — Report build

`scripts/build-report.ts` assembles a single `report.html` from:

- `report/parts/00-verdict.md` … `report/parts/12-roadmap.md`
- Pass/fail JSON matrix → rendered table
- Maturity scores JSON → rendered scorecards
- Screenshots embedded as data URIs (so HTML is self-contained)

Then:

- `node` markdown-it → `report.md`
- `chromium --headless --print-to-pdf` → `report.pdf`

All three land in `/mnt/documents/vanta-e2e/`.

## Maturity scoring rubric

Each surface gets 0–100 with: score, why, what passed, what failed, what raises it next. Surfaces scored: CommandCenter, Awareness, Telegram, Memory, Notes, Reminders, Commitments, Companion, Sherlock, Files, Actions, Audit, Settings, PWA/Mobile, Voice, Integrations, Overall.

## What I will explicitly NOT do

- Won't hit any real external API beyond what's already wired (no SerpAPI calls during seed, no Telegram bot calls, no real file OCR).
- Won't claim screenshots I didn't capture — placeholders are labeled.
- Won't redesign anything. Findings go in the report, not in code edits.
- Won't ship code changes as part of this task. Pure audit + report.

## Deliverables

```
/mnt/documents/vanta-e2e/
  report.html              (dark/tactical, self-contained)
  report.md
  report.pdf
  seed-summary.json        (every row inserted, IDs, teardown SQL)
  pass-fail-matrix.json
  maturity-scores.json
  screenshots/
    auto/*.png
    placeholder/*.md
scripts/
  vanta-seed.ts            (kept in repo so you can re-run)
  vanta-seed-teardown.ts
  build-report.ts
```

## Time / sequencing

1. Seed script + dry-run (verify tables, dry insert)
2. Real seed insert
3. Auto scenario runs (browser, ~10 screenshots)
4. Mocked telegram + action scenarios
5. Report assembly (HTML → MD → PDF)
6. Final QA pass on PDF (convert to images, eyeball every page)

## Open question before I start

The prompt says "do not pollute production unless this is the dev environment." Your account here **is** your live data. Tagged-seed means I can clean up, but for ~30 seconds during the test, your Memory/Commitments/Audit lists will show seeded items. If you want me to run this against a brand-new throwaway account instead, say so before I start seeding — otherwise I proceed against the cur

&nbsp;

Proceed against the current account using tagged seed only.

&nbsp;

Before inserting anything, run the seed script in dry-run mode and verify:

- every table that will be touched,

- every row type that will be inserted,

- every seeded row has metadata.seed=true or an equivalent removable test marker,

- teardown can find and delete every seeded row cleanly.

&nbsp;

After the test, run full teardown and confirm zero seeded rows remain.

&nbsp;

Do not use full seed/no tagging.

Do not run destructive tests.

Do not execute real external actions.

Do not send real Telegram messages.

Do not create real calendar events.

Do not expose secrets in screenshots.

If teardown verification fails, stop and report before proceeding.

&nbsp;

Mock Telegram and Actions only.

Hybrid screenshots are fine.

Deliver HTML + Markdown + PDF if possible.rent account with full teardown at the end.