# Ask — organization and experience

## Model

A thread is threaded operational memory, not a chat log: what it was about, which scope owned it, what record it was bound to, and what it produced (`src/lib/askThreads.ts`).

## Thread navigation

- Desktop: `ThreadRail` — a 240px spine with the room label and the explain-this control.
- Mobile: `ThreadBar` — a single row showing the active thread, its live state, a Stop control while streaming, and the explain-this control. Tapping opens a left slide-over sheet.
- Sheet order: New, Pinned, Recent, Archived (archived collapsed behind a count). Group labels appear only when a group exists, so a two-thread spine stays plain.
- Each row shows title, relative time, scope, and one context tag. No avatars, no unread counts, nothing Slack-shaped.

## Thread management

Create, rename, pin/unpin, archive/restore, delete, reopen, continue — all in the row's overflow menu, all through the provider so there is one code path. Deletion is a soft `deleted_at` so provenance survives.

## Message presentation

User turns stay compact. Vanta answers render as structured blocks (`StructuredResponse`): bottom line, what changed, what matters, sources, action, artifact, Sherlock finding, receipt, decision, waiting on. No generic bubble for every response.

## Composer

Collapsed to "Ask Vanta…" with attach, camera, voice, send. The attach menu exposes sources — Camera, Photos, Files — never capability modes. Attachments render as image thumbnails or file chips in a restrained horizontal strip, each removable, with context preserved across a send.

## Contextual suggestions

Three to four, keyed to the bound context: project (resume / what changed / next step / Sherlock), document (read / compare / explain / verify), receipt (explain / trace / open source), today item (why this / what changed / prepare next step).

## Safety

Ask reads and drafts. It never executes. Anything actionable becomes a draft in the Actions surface behind Plan → Approve → Execute.
