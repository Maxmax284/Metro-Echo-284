# Unified Polish: Ask, Connections, Motion, Proof of Life

Your prompt is 25 phases. Most of it is presentation work on systems that already exist — Ask threads, the quick widget, Telegram, wearables, help panels, motion tokens. No new rooms, no new data model, nothing that weakens the laws.

I'll do it in five waves, each ending with tests + typecheck. The one-week reality review can only be written after a week of real records, so it stays out of this pass.

## Wave 1 — Audit first, then Ask's room

Walk every surface at 384px (Today, Work, Ask, Receipts, Settings, sign-in, quick widget, connection screens, help popovers) and write `.lovable/vanta-unified-polish-audit.md` classifying each finding (already strong / hidden capability / confusing / dead affordance / needs proof / needs motion / deferred). Healthy systems get left alone.

Then Ask's thread organization: New / Search / Pinned / Recent / Archived as visible groups, with rename, pin, archive, restore, delete reachable without hunting. Thread rows stay restrained — title, relative time, scope, at most one context tag.

## Wave 2 — Ask as the intelligence surface

- **Context strip** above the composer: `Personal · GroundStay · 2 sources`. Tap opens a compact sheet to inspect context, drop optional sources, see where each came from, and whether it's current. Scope never mixes silently.
- **Structured answers**: Vanta's replies stop being one bubble. Bottom line first, then only the sections that apply (what changed, what it used, sources, confidence, what's uncertain, next step, prepared action, receipt). Progressive disclosure — the rest folds away.
- **Composer**: one placeholder, `Ask Vanta…`, and four controls — Attach, Camera, Voice, Send. Attach offers Camera / Photos / Files / Documents. No machine words anywhere (no OCR, Vision, Research, Sherlock toggles); you hand it material and ask in plain English, Vanta routes internally.
- **Quick widget**: proven to be the same engine — same thread, memory, context, scope, attachments, blocks, safety. `Continue in Ask` expands the same thread rather than starting a new one.

## Wave 3 — Synchronization proof

Exercise every hand-off that matters (Ask ↔ Work, Ask ↔ Receipts, Today ↔ Ask, Document ↔ Ask, Project ↔ Ask, Action → Receipt, Telegram → Work, wearable → Today/Ask, phone ↔ desktop, scope switch → Ask) and check the same six things each time: one object identity, same scope, provenance kept, no duplicate record, no stale context, no approval carried across. Failures and fixes go in `.lovable/vanta-synchronization-audit.md`, with tests for the ones that can be tested headlessly.

## Wave 4 — Connect Your World, Telegram, wearables, help

- **One Settings area, "Connect Your World"** (not a room): Telegram, Email, Calendar, Wearables, Phone health, Bluetooth, Ground Truth Hub, external platforms. Each card shows exactly one state — Connected / Partial / Needs setup / Switched off / Needs attention / No data yet — plus a proof line (`Last received 2m ago`, `Never linked`). No ambiguous empty cards.
- **Telegram**: status, linked chat, last received, last reminder sent, capture on/off, `Execution · never`, and Send test message that reports back `Test received in Vanta at 09:18`. Breakage says what's wrong in plain English ("Bot is reachable, but this chat is not linked").
- **Wearables**: organized by connection type, not brand — Direct Bluetooth / Phone health data / Imported accounts / Manual. Unsupported services say `Not directly connected yet` instead of implying support. Short setup flow: what to share → how to connect → test → done. Off means not read, not stored, not drawn as a zero; a missing day is a gap.
- **Body panel**: live value, source, age, posture, and the standing rule — body data changes how Vanta speaks, never what it decides. No recovery scores, no medical theater.
- **Help panels**: every question mark answers the same six lines — what this is, use it when, what lands here, what Vanta can do, what you can do, what never happens here. Dead help affordances get content or get removed.

Docs: `vanta-connections-experience.md`, `vanta-wearables-experience.md`, `vanta-help-panel-system.md`, `vanta-ask-widget-overhaul.md`.

## Wave 5 — Motion, street polish, proof of life

Motion becomes information, not decoration: live info slides in and locks its timestamp; history stamps and settles; actions lift, confirm, and land a receipt; connections trace, pulse once, and go still. Per-room personality — Today awake, Work mechanical, Ask fluid, Receipts stamped, Settings a maintenance bay. Graffiti stays static; nothing loops.

Street/cyberpunk language extends off the walls into panels — corner cuts, thin status lights, mono micro-labels, stamped identifiers, industrial glass, scan lines only during real processing. No neon soup, no glowing borders in reading zones.

Proof of life stays quiet and factual: `Checked 2m ago`, `Read from Telegram`, `From page photo`, `Daily sweep · 06:00`, `No changes`, `2 pages read · 1 unreadable`.

Then the sweep: 384px pass on every changed flow, reduced-motion equivalents, focus and 44px targets, no color-only meaning, and a performance check that a quiet screen is a still screen. Docs: `vanta-motion-language.md`, `vanta-cyberpunk-street-polish.md`.

## Not in this pass

- `.lovable/vanta-one-week-reality-review.md` — needs a week of real records first. I'll write it when the receipts exist.
- No new capability, no fifth room, no second chat surface, no path around approval.

## Technical notes

Ask work stays inside `AskThreadProvider` / `askThreads.ts` / `askSession.ts` — one engine, presentation-only changes in `ThreadSpine`, `ConversationSurface`, `ConversationDock`, `CompanionWidget`, `AskContextStrip`, `StructuredResponse`. Connections surface is a new grouped section in `settingsGroups.tsx` reusing existing status readers (`lib/integrations/status.ts`, `useSecretsStatus`, `useExternalPlatformDiagnostics`, `calendarSync`, wearable hooks) rather than new tables. Motion uses existing `lib/motion.ts` + `motionPrefs` `--feel-k` and `index.css` keyframes; no new animation systems and no always-running effects. Help copy extends `roomCopy.ts` / `DeskInfo`. New tests join the existing vitest suite; each wave ends with `bunx vitest run` and `bunx tsgo`.
