# Ask Synchronization + Multimodal Composer

Make Ask feel like the intelligence layer of the platform: one thread engine, one composer, one capability registry, context that arrives already loaded, and answers that come back as blocks instead of walls of text. Still four rooms. Nothing executes from Ask — it drafts, and approval stays in the platform.

First slice covers **image, document and voice** input. Video is deferred with an honest "not yet" state rather than a fake affordance.

## Wave 0 — Audit

Write `.lovable/ask-multimodal-sync-audit.md` classifying what exists today (Live / Partial / Reusable / Missing / Deferred) across the Ask room, the companion widget, thread persistence, context bindings, structured blocks, tool registry, attachments, voice, streaming, FLIP, mobile at 384px, and the tests already covering Ask/scope/navigation.

Confirmed already live and reused as-is: the shared thread engine (`AskThreadProvider`), context binding (`useAskContext` / `AskAboutButton`), structured blocks (`StructuredResponse`), staged file upload and OCR/extraction (`files-ingest`, `documents-extract`), streaming in `ConversationSurface`, and the routing seams landed last pass (`_shared/orchestration`).

## Wave 1 — Context strip and capability-aware suggestions

- A quiet context strip above the conversation: `Workspace · CampStay · Refund workflow`. Scope, bound object, mode. Never decorative — it reads from the active thread's binding and the active scope, and tapping the object chip travels to the record.
- Replace hard-coded prompt chips with suggestions derived from the capability registry plus the bound context kind: project → Resume / Summarize / Next step / Sherlock; document → Read / Compare / Verify; receipt → Explain / Trace / Open source; Today signal → Why this? / What changed? / Prepare next step. Three or four, never a toolbar.
- Extend `companionTools.ts` into the single registry the prompt asks for: availability, allowed scope, required input type, output block type, confirmation requirement, device support. Unavailable capabilities are hidden, not faked.

## Wave 2 — One multimodal composer

- One composer component used by the Ask room, the desktop drawer and the mobile sheet. At rest it shows `Ask Vanta…` plus attach, camera, voice, send. Everything else lives behind the attach menu and the `/` menu.
- Attachments render as a compact horizontal strip: type glyph, name, size, processing state, remove. No vertical wall. Multiple attachments supported.
- Camera is an input method (mobile capture + photo library), not a section. Voice feeds the same thread through the existing capture path — no second assistant.
- Desktop drag-and-drop onto Ask inherits the current thread's context and scope.
- Attachments persist on the message (`messages.metadata`) and as `ingested_files` rows, so reopening a thread shows what was attached.

## Wave 3 — Perception and research routing

- On send, run the request through the capability router: it decides perception jobs (extract / identify / interpret), internal retrieval, and whether research or Sherlock depth is warranted. The user never picks "OCR mode".
- Image reads return a perception block: detected text, category, confidence, unclear areas, suggested next step. Low confidence is stated plainly ("appears to be a USB-C ethernet adapter; I can't confirm the exact model").
- Document reads return type, key fields, summary, what matters, confidence — raw OCR only on request.
- Research answers land as bottom line → what I found → what matters here → what's uncertain → sources, with official sources first and disagreement said out loud. Private context is sanitized before any external call.
- Video: the attach menu accepts it, and Vanta says it can hold the file against a project but cannot read it yet.

## Wave 4 — Quick Ask becomes a real surface

- Desktop: right-side drawer anchored in the shell with an edge trigger, replacing the floating bubble as the primary pattern.
- Mobile: bottom sheet, partial height for a quick question, full height for longer work, keyboard-safe, thumb-reachable, attachments without layout collapse. 384px is the validation target.
- "Continue in Ask" carries the same thread, scope, messages, attachments, blocks and pending approval into the room. No copy, no duplicate thread, no reset — FLIP travel so the drawer visibly becomes the room.

## Wave 5 — State synchronization

- Anything Ask changes reflects immediately elsewhere: realtime where the tables already support it, targeted refetch where they don't. No reload, no tab-switching to see your own change.
- Thread, attachment, action, artifact and document scope all inherit the active scope. No cross-scope bleed.
- Blocks that produced something link to the resulting receipt.

## Wave 6 — Motion, streaming and polish

- Progressive block arrival with a subtle settle, real processing states only ("Reading the document…", "Checking context…"), no fake reasoning and no chain-of-thought.
- Send lifts the user's message into the thread; attachment previews settle; no large layout jumps.
- Rubik for copy, Space Mono for state and data, purple accents, hairlines, restrained grain. No bubble walls, no glowing orb, no terminal cosplay.
- Reduced-motion honoured throughout; focus vocabulary reused from the existing kinetic focus pass.

## Technical notes

- Composer lives in `src/components/ask/` as one component; the room, drawer and sheet are thin shells around it. No second thread store.
- Capability registry stays in `src/lib/companionTools.ts`, extended with the new fields; surfaces read it instead of listing tools inline.
- Routing decisions come from `supabase/functions/_shared/orchestration/capabilityRouter.ts`; `vanta-converse` consumes the plan and calls the existing `files-ingest` / `documents-extract` / `research-run` paths. `sanitizeQuery` guards every external call.
- Perception, document and research results emit the block shapes `StructuredResponse` already renders; new block kinds are added there, not as new screens.
- Migrations are additive only: attachment metadata and any block persistence extend existing tables (`messages`, `conversations`, `ingested_files`).
- Tests per wave: registry gating by scope and input type, attachment persistence and scope inheritance, router→block mapping, drawer-to-room thread continuity, and a 384px composer layout check.

## Out of scope

No fifth room, no camera/video/research rooms, no rebuild of the thread engine or structured blocks, no video understanding in this slice, and no execution path from Ask.
