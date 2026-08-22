# Vanta — Next-Generation Companion Audit

Read from the code on 2026-08-22. Every line below is traced to a file. Nothing here is aspirational; the roadmap lives in `.lovable/vanta-next-generation-architecture.md`.

Buckets: **Already live** · **Partially implemented** · **Architectural seam exists** · **Missing** · **Intentionally deferred**.

---

## 1. Rooms and desks

**Already live.** Four primary rooms with a formal model, not just tabs: `src/lib/navigation.ts` defines `PRIMARY_ROOMS = today | work | ask | receipts`, `SURFACE_PARENT` (every specialist desk declares its owning room), and `ADVANCED_SURFACES` (desks reachable but out of the primary nav). Surfaces in `src/components/surfaces/`: Today, Work, Ask (`ConversationSurface`), Receipts (`AuditSurface`), plus desks — Projects, Inbox, Briefs, Schedule, Memory, Commitments, Actions, Awareness, Sherlock, Command Center. Shell nav in `src/components/shell/SurfaceTabs.tsx`, room crossfade in `SurfaceCrossfade`, drill-down in `src/components/today/TodaySectionSheet.tsx`.

No fifth room exists. Every desk resolves to one of the four.

---

## 2. Awareness / judgment pipeline

**Already live**, as separate deterministic stages in `supabase/functions/_shared/awareness/`:

| Stage | File | Behaviour |
| --- | --- | --- |
| Normalized signal | `signal.ts` | `AwarenessSignal`, `ScopeIdentity`, `isGrounded()`, `signalDedupeKey()` (scope-segmented) |
| Vocabulary | `registry.ts` | source/kind registry with per-kind base impact (new in this pass) |
| Relevance | `relevance.ts` | six grounded factors, weighted, confidence multiplies rather than adds |
| Urgency | `urgency.ts` | five-rung ladder; `critical` is a whitelist, never a threshold |
| Suppression | `suppress.ts` | includes `attention_budget` as a first-class reason |
| Bundling | `bundle.ts` | collapses same-family signals |
| Delivery | `deliver.ts` | channel ladder; `liveChannels()` double-gates push and messaging |
| Evaluation | `evaluate.ts` | one run, one decision, at most one draft nudge per user per scope |
| Resolution | `resolve.ts` | retires pending nudges whose situation quietly got handled |
| Compression | `compress.ts` | per-channel verbosity (new in this pass) |

Adapters (facts only, no scoring): `adapters.ts` and `adapters-more.ts` — drift, commitments, actions, continuity, security/risk, documents, unrouted captures, Sherlock findings.

Runners: `awareness-drift-sweep` (hourly `pg_cron`), `ambient-pulse` (on-open), `awareness-decay`, `awareness-query`, `awareness-brief`, `awareness-snapshot`.

**Already live:** quiet hours (`_shared/drift.ts:isInQuietHours`, default 22:00–07:00 in the user's timezone, only `critical` may break them), shadow mode (`awareness_shadow_mode` pref, with a Settings toggle), attention budget, per-scope dedupe with a full unique index on `nudges (user_id, dedupe_key)`.

**Verified working:** shadow mode is off for the owner account, the sweep writes grounded nudges, and the resolution recheck retires them.

---

## 3. Presence / delivery channels

- **Today — live.** Every nudge lands here first. `src/components/today/NoticedRow.tsx`, `NudgesPanel.tsx`.
- **Messaging (Telegram) — live.** `_shared/awareness/inboundReach.ts` for the instant inbound path, `reachMessaging()` in `awareness-drift-sweep` for the sweep path. Notification only: no buttons, no commands, nothing executes from chat. `telegram-link`, `telegram-register`, `telegram-webhook`, `telegram-test`.
- **Push (phone) — partially implemented.** `_shared/webpush.ts`, `push-config`, `push-test`, `push-diagnose`, `src/lib/pushClient.ts`. Double-gated (`pushOptIn` + a live subscription) and clamps to Today when either is missing.
- **Wearable / voice / ambient — seam exists, not live.** Declared in `deliver.ts` `CommunicationChannel` and now given wordings by `compress.ts`; `liveChannels()` never returns them, so the evaluator cannot route there.

---

## 4. Inbound external signal (LMT Camp State, Fenrir, CampCore, email, forms)

**Already live.** `_shared/externalPlatform.ts` plus `external-platform-inbound`, `gth-inbound`, `campcore-inbound`, `fenrir-inbound`, `email-inbound`, `website-forms-inbound`, `external-platform-selftest`, `external-platform-diagnostics`.

`_shared/awareness/inbound.ts` builds structured detail (`buildSignalDetail`) and maps urgency (`inboundUrgency`) — bookings, payments, guest messages/requests. Inbound reach evaluates in seconds rather than waiting for the hourly sweep, and honours the same consent gates.

**Doctrine holding:** inbound always writes a capture first; the notice is secondary and cannot execute.

---

## 5. Capture inputs (senses that exist today)

**Already live:** voice capture (`src/components/capture/VoiceCaptureCard.tsx`), file intake and staging (`_shared/fileIntake.ts`, `files-ingest`, `GlobalDropZone`, `StagedFileChips`, `FileAftermathTray`), clipboard image intake (`ClipboardImageIntake.tsx`), OS share-target (`useSharedTargetIntake.ts`), email inbound, webhook inbound, document intake (`documents-extract`, `documents-draft`, `documents-review`).

**Missing as senses:** calendar, mailbox sync (only inbound email-to-capture exists, not a mailbox), device state, location beyond the awareness location helpers (`src/lib/awarenessLocation.ts`, `awareness-geocode`, `awareness-nearby-places` exist and are coarse), wearables, vehicle, NFC/Bluetooth, deliberate camera-as-sense (files can carry a photo; there is no "look at this" flow).

---

## 6. Continuity, working memory, corrections

**Already live.** `src/lib/continuity.ts` (90-day long-gap resume), `ProjectReentryCard.tsx`, `useContinuity.ts`, working-memory ranking in `src/lib/workingContext.ts` mirrored server-side in `_shared/workingContext.ts`, entity graph (`_shared/entityGraph.ts`, `entity-resolve`), memory search and autolink (`memory-search`, `memory-autolink`, `embeddings-generate`).

**Partially implemented:** continuity is per-user and per-project, not per-device. There is no shared cross-device context record — the context object type now exists (`_shared/awareness/context.ts`) but nothing persists or reads it yet.

---

## 7. Action lifecycle, approvals, receipts

**Already live.** Plan → Approve → Execute → Receipt end to end: `actions-transition`, `actions-execute`, `ExecuteConfirmDialog.tsx`, `ActionReceiptDrawer.tsx`, rollback in `_shared/actionRollback.ts`, audit trail in `_shared/auditEvent.ts` rendered as thermal-print receipts (`src/components/audit/ReceiptSlip.tsx`, `AuditDetailDrawer.tsx`).

Companion capability is bounded by mode (`src/hooks/useMode.ts`: locked / observer / advisor / operator, with `modeAllows()` mirrored server-side). Execution always needs a human.

---

## 8. Scope

**Already live and absolute.** `src/hooks/useScope.ts` + `src/lib/scope.ts` (`applyScope`), `WorkspaceProvider`, `organizations` + `organization_members` with roles `owner_admin/manager/member/viewer`. Signal identity is scope-segmented at the dedupe-key level (`signalDedupeKey`), so two workspaces with the same drift stay two situations.

**Note for the future:** identity lenses (Operator / Trainer / Developer) do **not** exist and must never be implemented as permissions — the type in `context.ts` documents them as priority lenses only.

---

## 9. Sherlock

**Already live.** `sherlock-investigate`, `sherlock-patterns`, `sherlock-watch`, `_shared/sherlockSuggest.ts`, scope-carrying findings/cache with `organization_id`, awareness adapter for `sherlock_finding_pending`, sensitivity gating (`_shared/sensitive.ts`, `src/lib/sherlock/sensitive.ts`).

---

## 10. Preferences, consent, voice

**Already live.** `src/hooks/useUserPreferences.ts` over `profiles.preferences`: proactive awareness on/off, shadow mode, quiet hours, push opt-in, `telegram_awareness_enabled`, brand voice (`brand_voice`, `brand_voice_intensity`, `brand_voice_no_jargon`) with `_shared/brandVoice.ts` mirrored to `src/lib/brandVoice.ts` and applied to Ask, briefings, and every notice.

**Partially implemented:** consent is per-capability but not yet per-sensor-family — there is no calendar / email / files / location / device / wearable / camera / microphone permission set, because those senses do not exist yet. When they land, each needs its own switch. No giant "allow everything".

---

## 11. Devices, PWA, native shell

**Already live:** installable PWA (`public/manifest.webmanifest`, `public/sw.js`, `usePwaInstall.ts`, `src/lib/pwaInstall.ts`), share-target intake, Capacitor config (`capacitor.config.ts`), web push.

**Missing:** device-class awareness (the app does not know it is on a phone versus a desk beyond viewport), background sync, wearable or vehicle surfaces, voice output (no TTS anywhere), continuous voice input.

---

## 12. Frontend vitality / visual system

**Already live.** One motion vocabulary in `src/lib/motion.ts` + `src/lib/motionPrefs.ts`; FLIP matched-layout travel (`src/lib/flip.ts`, `useFlipEntry.ts`); shell weather (`src/lib/weather.ts` → `<html data-weather>`); posture glyph with breathing/lean/iris; sparklines (`src/lib/sparkline.ts`); kinetic focus vocabulary (`.vanta-focus`); room crossfade with user-tunable duration/drift (`RoomMotionSection.tsx`); Rubik + Space Mono type system; state views (`@/components/ui/state-views`) and `vantaToast` as the only allowed toast path.

---

## 13. What this pass added (seams only, no behaviour change)

- `_shared/awareness/registry.ts` — open source/kind vocabulary with per-kind base impact. `relevance.ts` now reads impacts from it instead of a private table; the live weights are unchanged.
- `signal.ts` — `SignalSource` / `SignalKind` widened to `known | (string & {})`, so a new adapter registers instead of editing the core union. The `SignalAdapter<T>` contract already existed and is unchanged.
- `_shared/awareness/compress.ts` — one place that renders a notice at `rich | brief | signal | spoken | cue`, with `verbosityForChannel()`. The Telegram wording produced by the sweep and by inbound reach is byte-identical to before; both now call through it.
- `_shared/awareness/context.ts` — `VantaContext`, `Posture`, `DeviceClass`, `IdentityLens`, `mergeContext` (undefined never erases), `handoff`, `postureHoldsNoise`, `postureAllowsInteraction`, `describeContext`. Declared and tested, deliberately unread by UI.
- Mirrored into `src/lib/awareness/index.ts`; covered by `src/test/awareness-context.test.ts`.

No migration, no new surface, no changed pixel.

---

## 14. Intentionally deferred

Camera-as-sense, microphone meeting capture, wearable telemetry, vehicle context, NFC/Bluetooth triggers, smart-home sensors, automatic posture inference, adaptive attention learning, spoken output. All are documented as plugs in the architecture doc. None are stubbed — an empty placeholder integration is worse than nothing.

---

## 15. Recommended next construction phase

**Chapter 1, calendar first.** It is the only missing sense that improves timing, continuity, and decision support on day one, and it needs no new room: a calendar adapter emits `calendar_conflict` / `meeting_starting` / `travel_time_at_risk` signals into the existing pipeline, feeding Today (what's next), Work (project association), and Ask ("what does my day look like?"). It exercises the registry seam and the per-sensor consent pattern with the least risk.

**Then, in order:** manual situational posture (Training and Driving as the reference cases, no new tab), a persisted cross-device context record so the Ask thread survives a device switch, and only then voice/ambient output.

Not recommended yet: wearables, camera, NFC. They need posture and per-family consent to exist first, or they arrive as gimmicks.
