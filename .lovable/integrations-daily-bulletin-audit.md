# Vanta — Integrations + Daily Bulletin Audit (Design Only)

> Status: **Design only.** No code, no tables, no components, no migrations, no Command Center rework.
> Purpose: define how connected sources, system events, project activity, intake cleanup, exports, receipts, and background activity become a single plain-English bulletin in Command Center.
> Prerequisite for: Command Center Daily Bulletin implementation.

---

## 0. Product goal

Vanta should not feel like a dashboard of cards. It should feel like a calm daily bulletin board.

When the user opens Command Center, the first thing they should understand is:

- what happened
- what changed
- what needs attention
- what got cleaned up
- what was saved
- what was exported
- what needs attaching
- what can wait
- what sources are connected
- what Vanta noticed quietly

Command Center should answer one question: **"Here's what happened since you last checked."** No tech jargon. No database language. No raw integration language. Plain English.

---

## 1. Core principle (spine)

- Sources feed Vanta.
- Inbox catches things.
- Settings controls the noise.
- Projects understand things.
- Living Brief explains things.
- OpenCanvas arranges things.
- Exports package things.
- Receipts prove things.
- **Command Center tells the user what happened.**
- Companion Intelligence waits until later.

Capture never executes. Plan → Approve → Execute remains the spine.

---

## 2. Connected sources inventory

Every row uses plain-English names. Status is one of: **Connected**, **Partial**, **Planned**, **Later**, **Unknown**.

### 2.1 Telegram
- **Status:** Connected.
- **Brings in:** Messages, notes, project material, operational context.
- **Where it appears:** Inbox, Projects, Living Briefs, Command Center, Receipts.
- **Can it act?** No. Capture only.
- **Pause?** Yes (per-chat link + global pause planned).
- **Receipt:** every captured message logs a "new note captured" event in `audit_log`.
- **User copy:** "Telegram captures messages and turns them into notes, project material, or suggestions. Vanta will not reply or send messages without approval."

### 2.2 Email inbound
- **Status:** Connected.
- **Brings in:** Forwarded emails as captures, attachments as files.
- **Where it appears:** Inbox, Files, Projects, Receipts.
- **Can it act?** No.
- **Pause?** Yes (per-address disable).
- **Receipt:** capture + file ingest events.
- **User copy:** "Forward email to your Vanta address and it shows up as a capture. Attachments come in as files."

### 2.3 File uploads
- **Status:** Connected.
- **Brings in:** PDFs, images, docs, audio.
- **Where it appears:** Files, Inbox, Projects, Receipts.
- **Can it act?** No.
- **Pause?** N/A (user-initiated).
- **Receipt:** file ingest events.
- **User copy:** "Drop a file anywhere and Vanta files it for later use."

### 2.4 Mobile share target
- **Status:** Connected (PWA share target).
- **Brings in:** Links, text, images shared from other apps.
- **Where it appears:** Inbox.
- **Can it act?** No.
- **Pause?** Disable PWA share target at OS level.
- **Receipt:** capture event.
- **User copy:** "Share to Vanta from any app on your phone."

### 2.5 Screenshots / images
- **Status:** Connected (via share target + uploads).
- **Brings in:** Images, optional OCR text later.
- **Where it appears:** Files, Inbox, Projects.
- **Can it act?** No.
- **Pause?** Same as uploads.
- **Receipt:** file ingest event.
- **User copy:** "Screenshots come in as files you can attach to a project."

### 2.6 Voice notes
- **Status:** Connected (VoiceCaptureCard).
- **Brings in:** Audio + optional transcription (user-initiated).
- **Where it appears:** Inbox, Notes.
- **Can it act?** No.
- **Pause?** N/A (user-initiated).
- **Receipt:** capture event.
- **User copy:** "Tap to record a voice note. Transcription only runs when you ask."

### 2.7 Ground Truth Hub
- **Status:** Connected (inbound webhook).
- **Brings in:** Property, booking, and guest operational updates.
- **Where it appears:** Projects, Command Center, Receipts.
- **Can it act?** Only after approval.
- **Pause?** Yes (planned per-source toggle).
- **Receipt:** inbound event + any approved action.
- **User copy:** "Ground Truth Hub sends operational updates here. Anything that changes a booking needs your approval."

### 2.8 CampCore
- **Status:** Connected (inbound webhook).
- **Brings in:** Booking, payment, waiver, and operations updates.
- **Where it appears:** Projects, Command Center, Receipts.
- **Can it act?** Only after approval. Booking and payment logic is never touched from chat.
- **Pause?** Yes (planned).
- **Receipt:** inbound event + approval log.
- **User copy:** "CampCore sends booking, payment, and operations updates. Nothing changes in CampCore unless you approve it here."

### 2.9 Fenrir Lock
- **Status:** Partial / planned.
- **Brings in:** Security-relevant signals.
- **Where it appears:** Awareness, Command Center.
- **Can it act?** No (read-only).
- **Pause?** Yes (planned).
- **Receipt:** signal log.
- **User copy:** "Fenrir Lock sends security signals so you can keep an eye on things."

### 2.10 Calendar (read-only)
- **Status:** Planned.
- **Brings in:** Today's events and time windows, no edits.
- **Where it appears:** Schedule, Command Center (context only).
- **Can it act?** No.
- **Pause?** Yes.
- **Receipt:** signal event.
- **User copy:** "Vanta can read your calendar to know what your day looks like. It will not change events."

### 2.11 Push notifications
- **Status:** Connected (web push).
- **Brings in:** Outbound nudges only.
- **Where it appears:** OS notification tray; in-app receipts.
- **Can it act?** Outbound only, respects quiet hours and opt-in.
- **Pause?** Yes (per-device + global).
- **Receipt:** notification send event.
- **User copy:** "Push notifications only fire for things you opted into. Quiet hours are respected."

### 2.12 WhatsApp
- **Status:** Later.
- **Brings in:** (future) messages as captures.
- **Where it appears:** Inbox, Projects.
- **Can it act?** No (capture only when shipped).
- **Pause?** Yes (when shipped).
- **Receipt:** capture events.
- **User copy:** "WhatsApp capture is on the roadmap after Telegram is proven across all three platforms."

### 2.13 Manual notes / captures
- **Status:** Connected.
- **Brings in:** Free text typed inside Vanta.
- **Where it appears:** Inbox, Notes, Projects.
- **Can it act?** No.
- **Pause?** N/A.
- **Receipt:** capture event.
- **User copy:** "Type a note straight into Vanta whenever you want."

### 2.14 Project exports
- **Status:** Connected (Slice 5).
- **Brings in:** Saved PDFs from projects and brief composer.
- **Where it appears:** Project Saved exports, Briefs surface, Receipts.
- **Can it act?** No (user-initiated).
- **Pause?** N/A.
- **Receipt:** brief export event.
- **User copy:** "Exports are saved with the project and visible under Saved exports, Briefs, and Receipts."

### 2.15 Receipts / audit events
- **Status:** Connected.
- **Brings in:** Internal — every state change emits one.
- **Where it appears:** Audit surface, Command Center quiet cleanup section, project receipts drawer.
- **Can it act?** No.
- **Pause?** No (audit is permanent by design).
- **Receipt:** the receipt itself.
- **User copy:** "Every change leaves a receipt so you can always see what happened and why."

### 2.16 Intake cleanup events
- **Status:** Connected (Slice 6).
- **Brings in:** Stale-archive, dismiss, restore, group, stale-commitment events.
- **Where it appears:** Command Center "Quiet cleanup," Settings.
- **Can it act?** No.
- **Pause?** Tunable in Settings (windows, behaviors, limits).
- **Receipt:** every cleanup action writes an audit event.
- **User copy:** "Old or dismissed items get tidied up quietly. Nothing is deleted; everything is restorable."

### 2.17 Sherlock / background findings
- **Status:** Connected.
- **Brings in:** Inferred findings, sensitivity flags, pattern hints.
- **Where it appears:** Inbox chips, Command Center "Needs attention" sparingly, Receipts.
- **Can it act?** No.
- **Pause?** Yes (Sherlock settings).
- **Receipt:** finding events.
- **User copy:** "Vanta noticed something. Tap to review."

---

## 3. Event language layer

Raw events are never shown to users. The bulletin renders human strings only.

| Raw event                       | Human bulletin                                    |
|---------------------------------|---------------------------------------------------|
| `telegram.message.ingested`     | "New Telegram note captured."                     |
| `email.message.ingested`        | "New email capture."                              |
| `file.ingested`                 | "New file saved."                                 |
| `voice.note.captured`           | "New voice note saved."                           |
| `project_items.inserted`        | "Added to {Project}."                             |
| `project.summary.refreshed`     | "{Project} summary was refreshed."                |
| `brief.exported`                | "{Project} brief was exported and saved."        |
| `intake.dismissed`              | "Hidden from Command Center."                     |
| `intake.stale_archived`         | "Old loose capture was moved out of today's view."|
| `similar_captures.grouped`      | "Similar captures were grouped."                  |
| `commitment.stale_moved`        | "Old commitment moved to the Stale tray."         |
| `capture_route.suggested`       | "This may belong to {Project}."                   |
| `sherlock.finding.created`      | "Vanta noticed something worth a quick look."     |
| `push.notification.sent`        | "Nudge sent."                                    |
| `integration.inbound.received`  | "New update from {Source}."                       |
| `action.approved`               | "You approved {Action}."                          |
| `action.executed`               | "{Action} completed."                            |

### 3.1 Banned user-facing language

Never show: *webhook received, integration processed, entity candidate routed, signal detected, record inserted, database updated, object created, lifecycle state, deduplication engine, event payload, raw event, source pipeline, ingest, upsert, mutation, JSONB, RLS, hook fired, queue drained.*

### 3.2 Preferred phrases

*New note captured. Added to Ground Stay. Hidden from Command Center. Saved to exports. This may belong to CampCore. Needs review. Ready to summarize. Similar items grouped. Nothing urgent right now. Since you last checked.*

---

## 4. Daily bulletin structure

The future Command Center has one bulletin, not a card grid.

### 4.1 Top: "Since you last checked"

One short paragraph or compact grouped list. Example:

> Since you last checked: Ground Stay had 4 booking/payment updates, 2 stale captures were hidden, 1 export was saved, and CampCore has one file waiting for review.

If nothing meaningful changed: *"Nothing urgent right now."*

### 4.2 Sections (in order)

1. **Needs attention** — only items requiring a decision. Examples:
   - "Ground Stay payment notes may need a Living Brief refresh."
   - "This capture may belong to Lamai Global."
   - "CampCore has one file waiting for review."

2. **Project updates** — project-level changes, not raw item spam.
   - "Ground Stay had 3 booking-related updates."
   - "Vanta project summary was refreshed."
   - "CampCore received one new file."

3. **New captures** — recent intake only, limited by settings, grouped where possible.

4. **Done / Saved** — completed actions and saved outputs.
   - "Ground Stay brief was exported and saved."
   - "Added 4 payment captures to Ground Stay."
   - "Old laundry capture hidden."

5. **Quiet cleanup** — background tidy-up, shown compactly.
   - "2 stale captures were hidden."
   - "3 similar captures were grouped."
   - "Dismissed items stayed hidden."

6. **Connected sources** — one-line status summary.
   - "Telegram connected. File uploads active. Calendar not connected. WhatsApp planned later."

### 4.3 Bulletin rules

Every section has:

- a plain-English label
- a default item limit (3–5)
- collapse / expand
- "View all" when there is more
- dismiss-where-appropriate
- project-attach-where-appropriate
- receipt link where appropriate

Defaults:

- show 3–5 items per section
- group similar events
- hide stale and dismissed items
- prioritize project-level summaries over raw intake
- avoid duplicate cards
- never show raw event names

---

## 5. "Since you last checked" logic (recommended, not implemented)

Inputs to consider when computing the top summary:

- Last Command Center open timestamp (per user, per device acceptable).
- New captures since last check (messages, files, field notes, voice).
- New `project_items` since last check.
- New `brief_exports` since last check.
- New `audit_log` events since last check (filtered to bulletin-worthy types).
- New receipts surfaced from approvals.
- Stale items hidden since last check.
- Dismissed items since last check.
- Grouped captures since last check.
- Project summaries refreshed since last check.
- Connected source status changes since last check.

Composition rules:

- Aggregate by project where possible ("Ground Stay had 4 updates").
- Collapse cleanup into counts ("2 stale captures hidden").
- Surface exports individually ("Ground Stay brief saved").
- Cap the summary at ~3 clauses; overflow becomes "and a few more."
- If nothing meaningful: "Nothing urgent right now."

State storage (future): a single `last_seen_at` per user on the Command Center surface. No new table required — can live in `profiles.preferences`.

---

## 6. Integration capability rules

Every source is classified:

- **Capture-only** — brings information in, cannot act. *Telegram, email, files, screenshots, voice, manual notes, share target.*
- **Awareness-only** — context only, cannot act. *Calendar read-only, audit events, project activity, Fenrir signals.*
- **Approval-required action** — can suggest, never execute alone. *Ground Truth Hub actions, CampCore actions, outbound push, future outbound messaging.*
- **Disabled / later** — planned but not active. *WhatsApp, deeper calendar, wearables.*

### 6.1 Approval rule (non-negotiable)

Integrations can inform Vanta. Integrations can feed Vanta. Integrations can suggest action. **Integrations cannot execute without approval.** Capture never executes. Plan → Approve → Execute remains the spine.

---

## 7. Settings — "Connected sources" (future spec)

User-facing label: **Connected sources** (not "Integrations").

Each card shows:

- source name
- status (Connected / Partial / Planned / Later / Paused)
- what it brings into Vanta
- where it appears
- whether it can act
- whether action requires approval
- pause / disconnect controls
- recent activity (last N captures or events)
- receipt behavior

Example card — Telegram:

> **Telegram** — Connected.
> Brings in: messages and notes.
> Appears in: Inbox, Projects, Living Briefs, Command Center.
> Can act? No. Vanta will not reply or send without approval.
> Controls: Pause, disconnect, view recent captures.

Example card — CampCore:

> **CampCore** — Connected.
> Brings in: booking, payment, guest, and operations updates.
> Appears in: Projects, Command Center, Receipts.
> Can act? Only after approval.
> Controls: Pause, disconnect, view recent updates.

---

## 8. Relationship to current slices

- **Slice 5 (Project Overall Summary + Export):** bulletin surfaces *"{Project} summary refreshed"* and *"{Project} brief exported and saved"* in plain English. No new export plumbing required.
- **Slice 6 (Intake Lifecycle + Cleanup):** bulletin reads cleanup events out of the existing lifecycle layer and renders them in "Quiet cleanup." Stale and dismissed items never appear in the main feed.
- **Companion Intelligence Phase 1:** design doc only. Bulletin must **not** consume any `operator_profile_traits` until Phase 3+. Quiet ranking inside this session is allowed (per the CI doc §2); persistent traits are not.
- **Project flow:** Projects remain the center of gravity. Every bulletin item that can route to a project must offer a one-tap path there. Bulletin pulls users toward Projects, not into scattered tabs.

---

## 9. Out of scope (until later)

- Command Center rework itself.
- New components, routes, tables, or migrations.
- New event engine.
- New AI calls.
- WhatsApp bridge.
- Device expansion (lock-screen capture, wearables, location).
- Automatic actions of any kind.
- Habit learning.
- Operator Profile writes.
- Canvas PDF snapshots.
- Export theme customizer.

---

## 10. Acceptance criteria

This doc is complete if it answers:

1. What sources currently feed Vanta? — §2.
2. What sources are planned? — §2 (status field).
3. What does each source bring in? — §2.
4. Can each source act? — §2, §6.
5. Does action require approval? — §6.1.
6. Where does each source appear? — §2.
7. How do raw events become plain-English bulletin items? — §3.
8. What should "Since you last checked" show? — §4.1, §5.
9. How does Command Center avoid card clutter? — §4.3.
10. How do Projects, Exports, Receipts, and Intake Cleanup appear in the bulletin? — §4.2, §8.
11. What should be built later? — §9.
12. What is explicitly out of scope? — §9.

---

## 11. Recommended next step

After this doc lands:

1. Re-run the readiness check (Slices 5 + 6 manual pass).
2. If green, proceed to **Command Center Daily Bulletin implementation** — starting with the "Since you last checked" computation and the section scaffolding, reading exclusively from existing tables.

Do not start implementation automatically. Wait for the go.

---

## Final principle

Sources feed the system. The system never executes from a source. Command Center is where the user reads the day, calmly, in plain English.
