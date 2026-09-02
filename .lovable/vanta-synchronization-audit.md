# Vanta Synchronization Audit — cross-room hand-offs

Question asked of every hand-off: does the thing keep its identity, does the
right scope follow it, and is there a receipt afterwards?

| Hand-off | Identity kept | Scope on write | Scope on read | Receipt |
| --- | --- | --- | --- | --- |
| Ask → Work (notes, promises, actions) | Yes — real row ids returned and handed back | Yes (`withScope`) | Yes | Yes, every branch |
| Today → desk (Jump strip, section sheets) | Yes — navigation only, nothing copied | n/a | Yes, desk re-queries | n/a |
| Sherlock → project | Yes — the finding changes state in place | Yes | Yes | Yes |
| Telegram → inbox | Yes — same promise updated on Mark done / Snooze | Routed by saved default | Yes | Yes |
| Email → inbox | New note, attachments linked to it | Routed by saved default | Yes | Yes |
| Watch → Today / Work | Yes | Personal by design | Personal in every scope | Yes |
| Awareness → Today / Telegram | Yes | Yes | Yes | Yes at delivery |
| Calendar sync → Schedule diff | Yes — project links re-attached by event key across resyncs | Yes, from the feed | Yes | Yes |

## What was wrong, and what changed

**Email addresses named a project and then ignored it.** An inbound address can
carry a default project. That project was written onto the receipt line and
nowhere else, so mail never actually landed on the project it was addressed to.
Inbound mail now files the note against that project and writes a plain
`note.attached_to_project` receipt. Attachments still sit in the file tray for
review — nothing routes itself.

**The watch looked empty inside a workspace.** The watch cannot know which room
you are standing in, so readings are stored as yours, not a workspace's. The
body panels were filtering by workspace anyway, so stepping into a workspace
showed a blank body panel — which reads as lost data, not as a design choice.
Body readings are now read as personal in every scope. Sweep summaries and
awareness receipts stay scoped, because those are work, not body.

## Deliberate differences, not defects

Telegram and email arrive with no session, so they route by the default you set
on the link or the address rather than by whatever room you happen to be in.
That is a different trust model than in-app writes and is worth saying out loud
in the Connections panel: async intake follows its saved route.

## Left open

- Whether the Compare sheet for calendar changes re-applies scope on its own
  query — it renders scoped rows, but the guard is not asserted in a test.
- A scope change during a Today → desk tap is theoretically possible; both sides
  query independently, so the worst case is a re-read, not a wrong write.
