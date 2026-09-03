# Telegram as a lightweight remote companion — grounded audit + build order

Everything below is based on the code as it stands: `telegram-webhook`, `telegram-link`, `telegram-register`, `telegram-test`, `commitment-reminders`, `_shared/reminderMessage.ts`, `_shared/awareness/inboundReach.ts`, `sherlock-digest`, `TelegramLinkCard`, `user_channel_links` routing, and the Work desks.

## What Telegram actually is today

Pairing is `/start CODE` against `telegram_link_codes`, which writes both `telegram_chat_links` and a `user_channel_links` row with `default_route` (personal / ask_each_time / workspace:<id>). Every inbound message is rate limited, audited (`telegram.message_in`), scope-resolved (workspace routing requires an active membership, otherwise it silently falls back to personal), and then handed to the same model + voice constants the in-app companion uses, with four tools: save a note, set a reminder, stage an action, record a commitment. Nothing executes. Photos become pages: downloaded, stored in `memory-uploads`, filed as `ingested_files`, OCR'd through `pageRead`, de-duplicated on Telegram's update id, with the daily sweep as the fallback. When nothing routes, Sherlock suggests a lane and the reply says to open Vanta. Outbound already works three ways: promise reminders with **Mark done** / **Snooze 1h** / **Open in Vanta** buttons, awareness notices when `telegram_awareness_enabled` is on, and the weekly Sherlock digest.

## Classification

**1 — Already works today**
- Send text into the system; it routes to a note, reminder, commitment, or staged action, and lands in Inbox / Commitments / Actions with real audit rows.
- Send photos or image files: read as pages into the Inbox.
- Create a draft note.
- Turn something into a commitment, or a reminder with real timezone handling and follow-up questions when the time is vague.
- Mark an existing commitment done, and snooze one hour — from the reminder buttons, with lifecycle parity to the in-app snooze (an overdue due date moves too).
- Receive compact awareness signals and the weekly Sherlock digest.
- Deep link back into a commitment (`/?commitment=<id>`).
- One object identity: Telegram writes the same `notes`, `commitments`, `actions`, `ingested_files` rows. No parallel database exists.

**2 — Partly wired, needs polish**
- Asking "what changed / what's waiting / what's due" — the model has no read tools, so it answers from chat history rather than the actual desks, and the channel prompt even tells it briefings and schedule are unavailable. This is the biggest honesty gap.
- Deep links only exist for commitments. Notes, files, actions, projects, and findings have no Telegram-reachable link.
- Voice notes and non-image documents (PDF, Word, audio) get "text only for now" and are dropped, even though `files-ingest` and `documents-extract` already handle those file types in-app.
- Buttons exist only on reminder messages. Awareness notices, Sherlock digests, and capture confirmations are plain text with no **Noted** or **Open** action.
- Setup discoverability: `TelegramLinkCard` lives on the Index settings page and `/physical-loop`, but "Reconnect inbound messages" reads like an admin lever, there is no last-received timestamp, and the card never explains what Telegram can do beyond one law paragraph.
- Test proof exists and is honest (it trusts Telegram's body, not the gateway status), but the result only lands as a toast — no persistent "last test / last inbound / last failure" line on the card.

**3 — Safe to add now by reusing existing Work behavior**
- Read-only Work questions via new tools on the same model call, reusing existing server logic: what's waiting (Actions staged + Inbox unrouted counts), what's due or slipping (commitments overdue / due soon, the same query `commitment-reminders` uses), project status (`project-summarize` structured brief, compressed), what changed (`recap-compose` / audit rollup).
- Attach an incoming item to an existing project, and accept a suggested destination — the linking write already exists (`project_items`) and is low-risk, reversible, and scope-checked.
- Ask for a brief or summary to be drafted: `compose-brief` / `briefing-compose` already persist a draft in `brief_exports`; export stays an in-app approval.
- Plain-English explanation of an already-known document: reuse the stored extracted text; summary only, no edits.
- Acknowledge a nudge / "noted": the nudge lifecycle already supports acknowledgement in-app; add a **Noted** button using the same callback pattern as `done:` / `snooze1h:`.
- Reminder drafts and snooze presets beyond one hour.
- Compact deep links for every object type, built from `VANTA_PUBLIC_URL`.
- Voice notes and documents: download through the same gateway `/file/` path already used for photos, hand to `fileIntake` / `documents-extract`, transcribe voice with the AI gateway, file as capture.

**4 — Stays in Vanta only**
- Approving a prepared action, or moving one to executed.
- Payments, bookings, outbound email, any executor run.
- Editing or deleting commitments, projects, documents, or findings beyond the done/snooze/noted acknowledgements already allowed.
- Changing scope or default route, workspace membership, secrets, or integration settings.
- Exporting or sending a brief or document to anyone.
- Cross-reference case review and artifact generation.

## Command model — natural language, four visible buttons

No slash-command hell. Keep only `/start`, `/help`, `/unlink`. Everything else is plain language, and the reply carries at most two or three buttons drawn from a fixed vocabulary: **Noted**, **Mark done**, **Snooze**, **Open in Vanta**, and — on a capture that Vanta thinks belongs somewhere — **File under <project>**.

```text
Max:   nikki needs the fighter list by friday
Vanta: Logged as a promise, due Friday. It's in Commitments.
       [ Open in Vanta ]

Max:   what's waiting on me
Vanta: Three things: 2 drafts waiting for approval, 1 promise overdue
       (fighter list, was due Friday). Nothing else is slipping.
       [ Open Actions ]  [ Open Commitments ]

Max:   how's lamai going
Vanta: Lamai — 4 captures since Monday, 2 promises open, 1 thing Vanta
       flagged. Where it stands: registration sheets came in, weights
       still unconfirmed.
       [ Open project ]

Max:   [photo of a registration sheet]
Vanta: Read that page — 1,240 characters. It's in your Inbox as a draft.
       [ File under Lamai ]  [ Open in Vanta ]

Max:   draft me a weekly brief
Vanta: Drafted a weekly brief. It's sitting in Receipts unexported —
       approve it in Vanta and I'll never send it on my own.
       [ Open draft ]
```

## Setup and status gaps to close

The card should answer, in one glance: is it linked, does inbound work, when did Vanta last hear from this chat, when did it last reach me, what can I say to it, and what to do when it breaks. Concretely — add a "last message in / last message out" line from `audit_log` (`telegram.message_in`, `telegram.test_sent`, awareness delivery rows), keep the failure text from `telegram-test` visible on the card instead of only in a toast, rename "Reconnect inbound messages" to plain language with a one-line reason, and add a short collapsible "what you can say to it" list that matches the real tool set. Also surface the current default route (Personal / a named workspace) on the card, since that silently decides where captures land.

## Smallest implementation order

1. **Honesty pass (no new capability).** Correct the channel prompt so Telegram stops claiming briefings and schedule are impossible once step 2 lands, and stop the "text only" dead end from silently dropping value — acknowledge voice/document with what will happen next.
2. **Read tools.** Add `whats_waiting`, `whats_due`, `project_status`, `whats_changed` as read-only tools on the existing model call, each backed by the existing queries or functions. Compress to three lines max. This is the single biggest jump in usefulness.
3. **Deep links everywhere + button vocabulary.** One helper that turns any object kind + id into a Vanta URL, plus **Noted** / **Open** buttons on awareness notices, digests, and capture confirmations. Extend the existing callback handler; do not add a second one.
4. **Filing.** "File under <project>" button and natural-language project attachment, writing `project_items` with provenance.
5. **Voice and documents.** Reuse the gateway file download plus `fileIntake` / `documents-extract`, and transcribe voice through the AI gateway. Same Inbox destination, same de-dupe on update id.
6. **Draft asks.** Brief / summary / document explanation via existing compose functions, always ending in an unexported draft.
7. **Setup card clarity.** Last in / last out, visible failure reason, plain-language reconnect, route display, and the "what you can say" list.

Steps 1–3 alone bring Telegram to parity with the useful lightweight parts of Work. Nothing in this order adds an executor, a new object type, or a second database.

## Technical notes

New code stays thin: one `_shared/telegramReplies.ts` for buttons and deep links, one `_shared/workReads.ts` for the read tools (callable from both `telegram-webhook` and `vanta-converse` so the two channels never drift), and additions to the existing callback branch in `telegram-webhook`. Every read tool receives the already-resolved `userId` and `routeOrgId` so scope is enforced exactly as it is today; every write keeps emitting the same `audit_log` events so Receipts stay complete.
