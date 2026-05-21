# Phase 7 — Ecosystem Hooks Roadmap (doc only, no code)

Vanta does not replace platforms. It catches the signals that matter and turns
them into review-first operational objects. Every external system is a
**capture source**, never an execution surface.

## Build order (sequenced)

1. **Read-only adapters** — pull signals into `messages`/`ingested_files`/`signals` with `source = <system>`.
2. **Event → capture** — adapter writes a capture row; lands in Inbox.
3. **Capture → commitment routing** — user-driven, same triage path as everything else.
4. **Automated actions** — last, and only behind explicit approval rules per source.

## Event taxonomy

| Source        | Event types                                              | Becomes in Vanta                    | Approval |
|---------------|----------------------------------------------------------|-------------------------------------|----------|
| Website       | lead, inquiry, support_request, deploy_task              | capture → commitment/action draft   | manual   |
| GroundStay    | booking, guest_request, room_note, payment, checkin/out  | capture → commitment + entity link  | manual   |
| CampCore      | schedule_item, staff_note, maintenance, member_request   | capture → commitment (manager-only) | manual   |
| Fenrir Lock   | security_alert, suspicious_login, mfa_reminder, vault_audit | capture → action (high priority) | manual   |
| Aware         | scan, hazard, transport, connectivity, place_note        | field_note (exists)                 | n/a      |
| Telegram      | text, file, photo, voice (later)                         | capture (exists)                    | manual   |

## Future (sequenced after Telegram is proven on Vanta + GTH + CampCore)

- WhatsApp bridge — explicitly blocked until Telegram rock-solid on all three.
- Calendar — read-only event sync into `commitments` as drafts.
- Email — extend `email-inbound` to other addresses + per-sender rules.
- Voice notes — Telegram voice messages first, then native.
- Maps — pin selection from Aware → place capture.

## Hard rules

- No source executes anything in Vanta. Plan → Approve → Execute always.
- Adapters are owner-only, single-user. No shared graphs.
- Each adapter writes audit events `ecosystem.<source>.captured`.
- No paid APIs without a written reason and an off switch in `system_controls`.
- No new top-level surface per ecosystem source — everything lands in Inbox.

## Per-project sequencing (cross-Lovable)

1. **Vanta** — prove Inbox + Telegram + push (done / in flight).
2. **Ground Truth Hub** — port Telegram bridge with Kru Glitch voice.
3. **CampCore** — last. Role gates: members ask only, coaches read-only, managers summaries.
