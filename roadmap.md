# Consolidation + field-companion pass — status

## Brand law
- Product = Metro Echo. Intelligence = Echo. Owned by `src/lib/brand.ts` / `_shared/brand.ts`.
- **Frozen legacy identifiers (never rename — no user benefit, real breakage risk):**
  `vanta_*` database columns; `X-Vanta-*` signed webhook headers (outside platforms sign against
  these); the `vanta-converse` function name; `vanta-*` CSS classes; `vantaVoice` / `vantaIdentity` /
  `vantaSay` / `vantaBlocks` / `vantaNouns` / `vantaSignal` module names and their `VANTA_*` exports;
  `localStorage` keys prefixed `vanta.` (renaming wipes user settings); `sent_by: "vanta"` and
  `source_platform: "vanta"` wire/row values.

## Done (earlier)
- [x] 1. One action path (`_shared/actionStaging.ts` + `useStageAction`).
- [x] 2. One depth model + one urgency ladder (`responseDepth.ts`, `deviceCompression.ts`).
- [x] 3a. Telegram keeps its own conversation thread (`telegramConversation`).
- [x] 8. Provider names out of user-facing copy.

## This pass
- [x] A. Public identity cleanup: `@inbound.vanta` address, geocoder User-Agent + baked old URL,
      push tag, `ask_vanta` prompt/route token, cosmetic filenames, frozen-list documented.
- [x] B. One brain for Telegram: shared capability router, shared working context, shared transcript
      (`messages` canonical / `telegram_messages` transport-and-audit only), provenance on replies,
      shared file-intake schema, one outbound sender.
- [x] C. One place spine: single geocode/nearby owner mirroring `placeTruth` precision + freshness.
- [x] D. Trips as the shared cross-surface session: server-side trip owner, active-trip as shared
      state, Telegram can start/read/append/end the same trip, deep links carry session context.
- [x] E. Walk With Me as shared router capability + `walk_with_me` posture; `operationalState.ts` retired.
- [x] F. High-stakes groundwork: router recognition, simplified options, device dialer link,
      prepared-not-sent handoff. No sharing, no contacts, no execution.
- [x] G. Proactive field delivery through the existing awareness pipeline only, one sender.
- [ ] Remaining roadmap (not this pass): Today hierarchy pass; Aware 384px prove-it; motion
      consolidation; Ask <-> widget continuity; route consolidation (/watch /motion /glance
      /wearables /wearable-loop /physical-loop /how).

## Parked deliberately
Background/always-on location. Geofencing. Autonomous SOS or emergency calling. Silent location
sharing. Trusted contacts / `location_shares` execution. Realtime public-safety or crime-risk
scoring. Always-on listening, voice-in-ear. A fifth room or new dashboard. Live location trails.

- [ ] Google Calendar per-user connection (App User Connector) — blocked: workspace Google client card was closed; user to decide connector vs secret iCal link.
