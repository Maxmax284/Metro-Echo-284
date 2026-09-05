# Smarter underneath, obvious on top

Audit of what Vanta already has, what is half-built, and the smallest order to build the rest. Four rooms stay four rooms. No new surface, no new dashboard.

## Verdict in plain English

Vanta is already unusually well-built underneath. It reads every source, it explains itself in most places, and it refuses to execute anything on its own. Three things are genuinely missing, and they are the three that would make it feel intelligent:

1. It reports sources one at a time instead of telling you the one situation you are standing in.
2. It has no sense of "usual", so it cannot say "this is different" — every alert today is a fixed rule (silent 10 days, rescheduled twice).
3. Its explanations exist but in five different shapes, so "why am I seeing this?" doesn't feel like one promise.

Everything else on the list — connection health, motion vocabulary, device depth, approval gates, artifact pipeline, room teaching — already exists and mostly needs consolidation, not construction.

## What already exists and gets reused

- Cross-source read layers: `supabase/functions/briefing-compose/index.ts` (joins commitments, files, actions, notes, Sherlock findings, external messages in one pass) and `supabase/functions/_shared/workReads.ts` (`whatsWaiting`, `whatsDue`, `projectStatus`, `whatsChanged`).
- Ranking/freshness engine: `src/lib/workingContext.ts` (`rankWorkCandidates`, `freshnessOf`) and long-gap re-entry `src/lib/continuity.ts` (`rankContinuity`, `surfaceReasonFor`, snapshots in `projects.metadata`).
- Awareness pipeline: `supabase/functions/_shared/awareness/*` (relevance, urgency, suppress, bundle, deliver) plus `_shared/drift.ts` detectors.
- Honest connection health, already exactly what area D asks for: `src/lib/connections.ts` — six states (`connected/partial/needs_setup/off/attention/no_data`), `ago()`, `proofLine()`, one card per connection, no "connected" without evidence. Rendered by `src/components/settings/ConnectYourWorldSection.tsx`.
- Motion system: `src/lib/motion.ts` tokens over ~35 named keyframes in `src/index.css`, with a Feel knob (`feelK`, `feelMs`).
- Device depth: `src/lib/deviceCompression.ts` (`renderForms` → desk/phone/wrist/spoken, `formsAgree` subset guard) and `src/lib/glance.ts` (wrist carries zero or one, with a stated reason).
- Approval gate: `src/components/actions/ExecuteConfirmDialog.tsx` (one dialog, both call sites, typed confirm for standard/high risk, "Nothing else runs. Only this action.").
- Artifact spine: `Brief`/`BriefSection[]` → `src/lib/briefTemplates.ts` → `src/components/briefs/BriefPdfDocument.tsx` / `documentDocxExport.ts` → `brief_exports`. `src/lib/crossrefArtifact.ts` proves the extension pattern (build sections, reuse the renderer).
- Voice and identity: `_shared/vantaIdentity.ts`, `_shared/brandVoice.ts` (`brandVoiceDirective`, `toneLevelFor`), `_shared/sensitive.ts`. Identity leak is already closed.
- Room teaching: `src/lib/roomCopy.ts` (`ROOM_HELP`, `ROOM_HELP_ORDER`), `src/lib/deskTeaching.ts`, `src/components/aftermath/SurfaceAftermath.tsx`.

## What is partly there

- **One situational read**: `briefing-compose` is the widest join but omits calendar and body data, and its output is a one-shot brief, not a reusable situation. `todayDigest.ts` summarises per lane, not across lanes.
- **Baseline**: `useWearableTrends` computes a 14-day trend for body data only. Nothing else has a notion of normal. All drift thresholds in `_shared/drift.ts` are constants.
- **Why this?**: two independent primitives — `src/components/ui/why-this.tsx` (generic stored string) and `src/components/sherlock/WhyThisTriggered.tsx` + `SherlockEvidenceDrawer.tsx` (structured signals via `sherlockWhy.ts`). No shared provenance/freshness strip; freshness formatting lives only in `connections.ts`.
- **Health as proof of life**: the six-state vocabulary exists but only on the Settings connections list. Today never shows "a source went late".
- **Motion**: `tailwind.config.ts` still ships a second vocabulary (`fade-in`, `slide-up`, `pulse`) used in ~11 files — legacy leftovers next to the narrated system.
- **Pre-action preview**: the dialog shows the intended payload as JSON, not a before/after. No structured "what changes / what does not".
- **Device depth**: Telegram re-writes its own compression rules in prose inside `telegram-webhook/index.ts` instead of consuming `deviceCompression.ts`.

## What genuinely needs new code

- A situation reader: `_shared/situation.ts` + `src/lib/situation.ts` — one pure module that takes already-fetched rows from every lane and returns one ranked read with reasons and sources.
- A baseline module: `_shared/baseline.ts` — per-object cadence from recorded history (how often this thing usually moves), plus `unusual()` returning `{ normalRange, observed, verdict: "usual" | "quiet" | "unusual" | "no baseline yet" }`. Missing data stays missing.
- A rollup table `object_cadence` (user, org, object type, object id, window, samples, median gap, last computed) so baselines are not recomputed per render.
- One reveal primitive: `src/components/ui/why-surfaced.tsx` with a fixed seven-line shape (source · what changed · compared with · reason · freshness · why it matters · if ignored) plus `src/lib/whySurfaced.ts` to build it from recorded evidence only.
- A shared `ProvenanceStrip` ("From Telegram · 2m") built on `connections.ts:ago`.
- `src/lib/consequence.ts` + a `ConsequencePreview` block inside the existing dialog: before / after / what changes / what does not / what gets notified / what stays reversible, ending "Nothing has changed yet."
- Health surfacing in Today: derive the six states for every source, show only sources that are late, missing, or off.

## What should NOT be built

- No fifth room, no new dashboard, no second renderer for documents, no second "why" component, no scores, no streaks, no diagnosis language for body data.
- No typewriter animation, no continuous glow, no camera work this pass (area K stays parked).
- No new execution path: the consequence preview reads and renders, it never stages or runs.
- No new object systems: situation, baseline and reveals all read existing tables.

## Dangerous inconsistencies found

1. Two things are called continuity: `src/lib/continuity.ts` (project re-entry) and `VantaContextProvider` (device handoff). Name one of them differently in copy before adding resurfacing work.
2. `deskTeaching.next` and `SurfaceAftermath` both answer "where does this go" for overlapping desks — they can drift apart.
3. Telegram's depth rules are prose in a prompt, not shared code — will silently diverge.
4. Legacy Tailwind animations coexist with the narrated motion system.
5. `_shared/drift.ts` thresholds read as judgements ("went quiet") but are constants; once baselines land, drift must consult them or the two will disagree in front of the user.

## Build order

**Phase 1 — one situational read + a sense of usual**
New `_shared/situation.ts`, `_shared/baseline.ts`, `object_cadence` table, a nightly cadence job, and Today's top block replaced by one situation line with sources. Accept when: Today opens with one read that names at most three things, each with source and freshness; nothing says "0" for a source with no data; a project that usually moves weekly and hasn't in three weeks reads as unusual, while a project that never moves reads as no baseline yet.

**Phase 2 — why this, health, resurfacing**
`whySurfaced.ts` + `WhySurfaced` replacing both existing reveals, `ProvenanceStrip` everywhere something proactive appears, source health in Today, and a small "Picking up where you left off" line on re-entry. Accept when: every proactive card has the same seven-line reveal built from recorded evidence; a late source says so until it is not late; the resurfacing line always states why and when.

**Phase 3 — motion and text as one system, plus consequence preview**
Retire the Tailwind duplicates, add the missing verbs (routing moves, relationship draws, uncertainty pauses, failure stops calmly), standardise the failure text ("Didn't run." → reason → "Nothing else changed." → Try again / Fix first), and add the consequence block to the execute dialog. Accept when: no animation exists outside `motion.ts`; every failure in the app reads the same three lines; the dialog shows before/after in words with "Nothing has changed yet." and still cannot execute by itself.

**Phase 4 — one Vanta, many bodies**
Telegram consumes `deviceCompression.ts` instead of prose rules; Ask answers land answer → reason → evidence → action; watch and spoken forms come from the same call. Accept when `formsAgree` holds for a Telegram reply and its desk form, verified in tests.

**Phase 5 — designed report lane (optional, parallel)**
A second renderer beside `BriefPdfDocument.tsx` switching on a new template mood, same `Brief` content, same `brief_exports`, receipt says which lane produced it.

**Parked**: deliberate camera perception (area K), continuous sensing of any kind.

## Order change from the request

One change: build baseline in Phase 1 alongside synthesis rather than after it. The situation read is what consumes "different from usual" — shipping synthesis first would mean writing ranking rules twice.

## Technical notes

- Shared primitives, one owner each: freshness (`connections.ts:ago`), ranking (`workingContext.ts`), reveal (`whySurfaced.ts`), depth (`deviceCompression.ts`), motion (`motion.ts`), artifacts (`Brief`/`brief_exports`).
- All new server modules are pure and dependency-free so the client mirrors can re-export them, matching `drift.ts` / `vantaIdentity.ts`.
- `object_cadence` gets GRANTs for `authenticated` (select) and `service_role` (all), RLS scoped to `user_id` with the existing organization filter.
- Everything scope-filtered through `useActiveScope()` / `scoped()` as today.
