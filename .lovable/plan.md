# Physical loop — from paper to receipt, in the product

Right now the physical loop only exists as a markdown note in the repo and as
mechanics spread across Telegram, files and reminders. This turns it into one
real panel in Work, adds a daily sweep that actually reads your handwritten
pages, and gives you a live tracker for walking one promise end to end.

Nothing here changes the laws: capture never executes, and Plan → Approve →
Execute still only happens inside Vanta.

## 1. The Physical loop panel (lives in Work)

A new folding panel in Work's "Where Vanta looks" shelf, titled
**Paper and phone**. Four parts, all built from real records — no static copy
pretending to be status:

- **Phone line** — whether your Telegram chat is linked, when it last sent
  something, and one sentence on what it can and cannot do ("it parks things
  and drafts steps; it never runs one").
- **Sync line** — the last daily sweep as a diff, not a status: "Yesterday
  06:00 — 3 pages read, 2 filed to Inbox, 1 unreadable." If nothing changed it
  says so plainly. A "Read now" button runs the sweep on demand.
- **Reminder buttons** — plain-English explanation of the two buttons Telegram
  reminders carry (Mark done, Snooze 1h), what each writes, and a note that
  these are the only lifecycle changes reachable from chat.
- **Walk a promise** — a live five-step tracker (below).

## 2. Handwritten notes → Vanta, daily

Two ways in, one reader, one sync line.

- **Photo to Telegram**: the bot currently ignores photos and answers
  "text only". It will accept photos and document images, pull the file, store
  it, read the text, and file it as a capture in your Inbox with the source
  showing "From Telegram · page photo". Caption becomes the title when present.
- **Photo in the app**: page photos uploaded in Vanta are already stored; the
  sweep picks up any that have not been read yet.

A daily scheduled sweep reads unread page photos, files each as a capture, and
records one diff receipt. Unreadable pages are left alone and reported, never
silently dropped. Quiet hours are respected for any notification; the sweep
itself is silent and just leaves a line.

## 3. Walking a real promise through Telegram

The tracker watches your actual records and ticks each step as it truly
happens, so you can walk it from your phone without guessing:

```text
1. Sent from phone        promise captured with source Telegram
2. Landed as a promise    open commitment exists, right timezone
3. Reminder delivered     reminder sent, buttons attached
4. Marked done from chat  status done + receipt with from → to
5. Shows as done          visible as closed in Work and Today
```

Each step shows its evidence (time, receipt) or what is still missing. Step 3
gets a **Send the reminder now** button so you do not have to wait for the
scheduled run. Nothing in the tracker writes state itself — it only reads.

## 4. The doc becomes truthful

The repo doc stays as the engineering record, but its "needs the owner's phone"
checklist is replaced by a pointer to the live tracker, so there is one place
that knows whether the loop has been walked.

## Technical notes

- `telegram-webhook`: add a photo / image-document branch — `getFile` through
  the connector gateway, upload to the existing files bucket, insert an
  `ingested_files` row with scope, then call the existing `files-ingest` OCR
  path and create the note capture. Idempotent on `update_id`, audit receipt
  carries `source: "telegram"`, still no execution path.
- New edge function `physical-sweep`: scoped read of `ingested_files` rows that
  are page photos with no `extracted_text`, calls `files-ingest`, creates the
  capture, then writes a single `audit_log` event `physical.sweep` whose payload
  holds the diff counts. Uses `job_leases` for idempotency like the digest.
  Scheduled daily via `pg_cron`. No new table — the receipt is the record.
- New hook `usePhysicalLoop` reads: `telegram_chat_links`, the last
  `physical.sweep` receipt, and the five promise-walk signals
  (`commitments` with Telegram source, `audit_log` reminder + completion
  events). All queries go through `applyScope`.
- New components: `PhysicalLoopPanel.tsx`, `SyncLine.tsx`, `PromiseWalk.tsx`
  under `src/components/work/`, mounted inside the existing
  `CollapsibleSection` in `WorkSurface.tsx`.
- Copy through `vantaNouns` / `roomCopy`; toasts via `vantaToast`; states via
  `state-views`; validated at 384px.
- Tests: sweep diff wording (including the "nothing changed" case), promise
  walk step resolution from records, and Telegram photo capture shape.
