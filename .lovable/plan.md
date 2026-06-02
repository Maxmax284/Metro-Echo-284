# Platform Integrations — settings pass

One job: put the wiring map in one place. Read existing state, surface it clean. Don't build bridges, don't add execution, don't duplicate toggles.

## Where it lives

Add a new route `Settings → Integrations` inside the existing Settings page (`src/pages/Settings.tsx`). Reuse the current `EcosystemSourcesPanel` logic — that panel becomes one section inside the new, larger Integrations view (not deleted, absorbed). System Controls page keeps its kill switches; Integrations is the human-readable front door that reads/writes the same `system_controls` row.

No new top-level nav. New section anchor in Settings sidebar/tabs: **Integrations**.

## Page structure

```text
┌─ Doctrine banner ─────────────────────────────────┐
│ Signals land. Vanta drafts. Humans approve.       │
│ Each source has its own kill switch + audit.      │
└───────────────────────────────────────────────────┘

[ Global pause ] (only if backed by existing control; else "Planned")

── Connected now ──────────────────────────────────
  • Vanta Core         Live
  • Telegram           Live / Partial (reads tg tables)
  • Email              Live (reads email_inbound_addresses)

── Planned next ───────────────────────────────────
  • Ground Truth Hub   Partially live (gth-inbound exists)
  • CampCore           Planned
  • Calendar           Planned, read-only first
  • Fenrir Lock        Planned
  • Website / Forms    Planned

── Deferred ───────────────────────────────────────
  • WhatsApp           Deferred until Telegram proven

── Event registry ─────────────────────────────────
── Callback registry ──────────────────────────────
── Secrets & webhooks ─────────────────────────────
── Future adapter template ────────────────────────
```

Mobile (384px): stacked cards, diagnostics collapsed, kill switch + status always visible. Desktop: grid for cards, tables for registries.

## Card anatomy (same shape for every platform)

- Name + role one-liner
- Status pill: Live / Partially live / Configured / Needs setup / Planned / Deferred / Disabled / Blocked
- Direction: Inbound / Outbound / Inbound+approved outbound / Read-only / Capture only / Deferred
- Kill switch (bound to existing `system_controls.<x>_enabled` where it exists; otherwise marked "Planned control")
- Allowed inbound events (static list, from spec)
- Allowed outbound callbacks (static list, from spec)
- Approval rule (plain English)
- Setup checklist (documentation, not tasks)
- Collapsible diagnostics: last event at, 7d count, last error, signature status
- Webhook URL (copy button) — only when one exists
- Secret status: Configured / Not configured / Unknown (masked, never raw)
- Audit link (filters Audit surface by source prefix, e.g. `ecosystem.gth.`)

## Per-platform truth table

| Platform | Kill switch source | Webhook fn | Real status to show |
|---|---|---|---|
| Vanta Core | n/a | n/a | Live |
| Ground Truth Hub | `gth_enabled` | `gth-inbound` | Partially live |
| CampCore | `campcore_enabled` | none | Planned |
| Telegram | (none yet — mark "Always on if linked") | `telegram-webhook` | Live if `telegram_chat_links` row exists, else Needs setup |
| WhatsApp | none | none | Deferred |
| Email | none yet | `email-inbound` | Live if `email_inbound_addresses` row exists |
| Calendar | `calendar_sync_enabled` | none | Planned, read-only first |
| Fenrir Lock | `fenrir_enabled` | none | Planned |
| Website / Forms | none | none | Planned |

Status is computed from real signals (function existence, table rows, control flags). Never hardcode "Live" without backing evidence.

## Registries

**Event registry** — single static `registry.ts` exported as data; render as filterable table on desktop, accordion on mobile. Columns: Platform · Event · Direction · Status · Creates in Vanta · Requires approval · Sensitive · Last received (joined from `audit_log` where prefix matches).

**Callback registry** — same shape, outbound. Columns: Platform · Callback · Status · Approval · Risk · Last called. All entries marked Planned/Deferred unless code path exists.

## Secrets section

Reads `system_controls` + a curated list of expected secret names (GTH_WEBHOOK_SECRET, TELEGRAM_API_KEY, VAPID_*). Shows **status only** (Configured / Missing). Never values. "Rotate" button only where backend supports it — otherwise hidden. Copy-to-clipboard only for webhook URLs.

## Doctrine guardrails enforced in copy

Every card carries the same approval rule line. No "auto-sync", no "orchestration", no "mesh". Banner pins the doctrine at the top so it can't get lost.

## Out of scope (explicit non-goals)

- No new tables
- No new edge functions
- No new automation, callbacks, or executors
- No WhatsApp wiring
- No CampCore wiring
- No Ground Truth Hub outbound
- No test-event button unless trivially safe and read-only (deferred this pass — show "Test event not available yet")
- No changes to `system_controls` schema (use existing flags only)
- No duplication of the System Controls kill-switch list — Integrations links over to it where flags don't have a per-card switch

---

## Technical section

**New files**
- `src/pages/IntegrationsSettings.tsx` (or new tab inside `Settings.tsx`) — top-level page
- `src/components/integrations/IntegrationCard.tsx` — generic card
- `src/components/integrations/IntegrationStatusPill.tsx`
- `src/components/integrations/IntegrationDiagnostics.tsx` — collapsible, reads `audit_log` by prefix
- `src/components/integrations/EventRegistryTable.tsx`
- `src/components/integrations/CallbackRegistryTable.tsx`
- `src/components/integrations/SecretsStatusPanel.tsx`
- `src/components/integrations/AdapterTemplateCard.tsx`
- `src/lib/integrations/registry.ts` — static event + callback definitions, per-platform metadata, audit prefix, kill-switch key, expected secrets
- `src/lib/integrations/status.ts` — pure functions: `computeStatus(platform, controls, signals)` returning the status label

**Reuse / refactor**
- Absorb `EcosystemSourcesPanel.tsx` logic into `IntegrationCard` + diagnostics. Keep the existing audit-prefix count query pattern (`audit_log` like `<prefix>%`, 7d window).
- Read `system_controls` via existing `useSystemControls` hook — no new RPC.
- Telegram status: `select 1 from telegram_chat_links where user_id = auth.uid()`.
- Email status: `select 1 from email_inbound_addresses where user_id = auth.uid() and active`.

**Routing**
- Add route or tab `/settings/integrations` (match existing settings pattern in `Settings.tsx`).
- Link from Settings index and from System Controls page ("See all integrations →").

**Styling**
- Semantic tokens only. Reuse existing card surfaces, ring/border tokens, muted text classes from current Settings panels for visual continuity.
- Mobile: single column, sticky status pill + kill switch on each card header.
- Desktop: 2-col grid for cards, full-width tables for registries.

**Audit links**
- Each card's "View audit" button deep-links to the Audit surface with a source filter query param (audit prefix from registry). If the Audit surface doesn't yet support a query-param filter, link to `/audit` and show a small hint — do not add filter logic this pass.

**Security**
- No raw secret values in client. Secret status fetched server-side only via existing patterns (or shown as "Configured"/"Missing" based on a server-trusted list — defer the lookup to a follow-up if no safe path exists today; for now mark all as "Status check available in Lovable Cloud").

**Acceptance check**
Walk the 20-point criteria list at the end of the spec against the rendered page before declaring done.
