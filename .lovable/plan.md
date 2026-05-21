## Wave 1 + Wave 2 — Parallel Execution Plan

Two surgical fixes running together. No new systems, no duplicates, no scope creep beyond what Wave 0 flagged.

---

### Wave 1 — Awareness Truth + Recovery Consolidation

**Goal:** One active-place line. One recovery panel. Honest fallback copy.

**Files touched**
- `src/hooks/useActivePlace.ts` *(new)* — single source of truth. Resolves in priority: GPS → saved primary → manual → last-confirmed → fallback (city/region) → none. Returns `{ source, label, confidence, lastConfirmedAt }`.
- `src/components/awareness/LocationRecoveryPanel.tsx` *(new)* — collapses today's three surfaces (fix-location chip, recovery card, unresolved-saved warning) into one panel. Shows only when `confidence < ok` or source is `fallback`/`none`.
- `src/components/surfaces/AwarenessSurface.tsx` — replace the three scattered banners with `<ActivePlaceLine />` + conditional `<LocationRecoveryPanel />`. Remove duplicate warning logic.
- `src/lib/awarenessPlainTalk.ts` — rewrite copy strings:
  - GPS: "Using your current location"
  - Saved: "Using {name}"
  - Manual: "Manually set to {name}"
  - Fallback: "Approximate — {region} area"
  - None: "Location unknown — tap to set"
- `src/components/awareness/SourceStatusPill.tsx` — isolate Reddit/community failures so one provider down doesn't poison the whole awareness state.

**Acceptance**
- 384px viewport: one active-place line at top, one recovery panel max.
- No duplicate "broad/offshore" warnings after a place is selected.
- Reddit outage shows pill-level red, not surface-level red.

---

### Wave 2 — Push/VAPID Diagnostics

**Goal:** Never claim "Push ON" unless it's actually deliverable.

**Files touched**
- `supabase/functions/push-diagnose/index.ts` *(new)* — returns `{ vapidConfigured, subscriptionValid, swActive, lastDeliveryAt, staleSubscription }`. Emits audit event.
- `src/lib/pushClient.ts` — replace single `isLive` boolean with `usePushDiagnostics()` calling the new function. Detect stale subscription (server 410/404 on last send) → set `needsReEnable`.
- `src/components/settings/PushReadinessSection.tsx` — split into 5 status rows:
  1. Browser permission
  2. Service worker registered
  3. Subscription valid
  4. Server VAPID configured
  5. Last delivery confirmed
- All-green required before showing "Push ON". Otherwise show actionable row-level CTA (Grant permission / Re-register / Re-enable).

**Acceptance**
- VAPID misconfigured server-side → UI says "Server not configured", not "Push ON".
- Stale subscription → "Re-enable push" CTA appears.
- Each state change emits an audit event.

---

### Out of scope (deferred to Wave 3+)
Telegram delivery trace, conversational routing sweep, voice/emoji rules, realtime sync, mobile retest pass, final validation PDF.

### Guardrails
- No paid AI calls on render.
- No notifications without opt-in.
- Plan→Approve→Execute preserved.
- No duplicate Memory/Notes/Files/Reminder/Audit systems.
- All copy passes Vanta voice (warm, no exclamations, no robotic phrasing).

### Deliverable
Both waves land in a single commit set. Brief in-chat summary on completion. No PDF for this pass — save the report for Wave 6.
