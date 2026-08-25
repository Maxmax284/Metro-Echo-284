# Ask Complete Overhaul — Current-State Audit

Read of the code as it stood before this pass. Classification per the brief:
Live / Partial / Reusable / Missing / Needs replacement / Deferred.

## Ask core

| Area | State | Note |
| --- | --- | --- |
| Ask room (`ConversationSurface`) | Live | One surface, mounted by both the room and the quick drawer. |
| Quick surface (`CompanionWidget`) | Partial → fixed | Right-side sheet on desktop, drawer on mobile — but the trigger was a floating chat bubble. Trigger replaced with a shell-docked Ask tab (desktop right edge) and a docked pill flush with the bottom nav (mobile). |
| Thread engine (`askThreads.ts`, `AskThreadProvider`) | Live | Auto-title, rename, pin, archive, delete, reopen, scope isolation, context binding. One engine, no duplicate. |
| Volatile thread state (`askSession.ts`) | Live | Transcript cache, draft, streaming, abort — shared by drawer and room, so a live turn survives the move. |
| Continue in Ask (`askPromotion.ts`) | Live | Navigation act, not a data act. Same thread, same context, same attachments. |
| Context strip (`AskContextStrip`) | Live | `Scope · Kind · Object`, removable. |
| Context handoff (`useAskContext`, `AskAboutButton`) | Live | One contract from Today / Work / Document / Receipt / Sherlock. |
| Thread as work record (`outputs`, `outputChips`) | Live | Counts link out; nothing duplicated in the thread. |
| Structured blocks (`vantaBlocks.ts`, `StructuredResponse`) | Live | Block composition instead of chat walls. |
| Inline approvals (`InlineApprovalActions`, `ExecuteConfirmDialog`) | Live | Ask stages; approval and execution stay outside. |

## Multimodal composer

| Area | State | Note |
| --- | --- | --- |
| One composer (`ConversationDock`) | Live | Same component in the drawer, the sheet and the room. |
| Text / voice / camera / photo / document / file | Live | Attach menu routes, camera only where a camera exists, Web Speech dictation feeds the same thread. |
| Attachment chips (`AttachmentStrip`) | Live | Compact horizontal row, per-chip state, no vertical wall. |
| Honest readability (`readabilityFor`) | Live | Video says it will be kept, not watched. No capability theater. |
| Video understanding | Deferred | Honest "can't watch video yet" state; the seam stays. |
| Drag-and-drop into Ask | Missing → added | Desktop drop on the Ask surface stages into this thread instead of falling through to the global staging card. |
| Processing language | Partial → improved | Was "Reading your context" for everything. Now says what it is actually reading (document, image, audio, or context). |
| Clipboard / share intake | Live | `ClipboardImageIntake`, `useSharedTargetIntake`. |

## Capability + routing

| Area | State | Note |
| --- | --- | --- |
| Capability registry (`companionTools.ts`) | Live | Availability, scope, required input, device support, confirmation, direct exposure. One registry, no per-surface menus. |
| Capability router (`orchestration/capabilityRouter.ts`) | Live | Perception vs retrieval vs research decided server-side per turn. |
| Sanitized research | Live | Private context → sanitized query → external fetch → private synthesis. |
| Context suggestions (`suggestionsForContext`) | Live | Short list, attachments win over context. |

## Synchronization

| Area | State | Note |
| --- | --- | --- |
| Ask → Actions / Commitments / Memory | Live | Draft-only intents with inline receipts. |
| Ask → Waiting on / Decision / Artifact | Missing → added | Three new draft-only intents writing through existing tables (`commitments` with a waiting marker, `notes` tagged decision/artifact), each with a thread output reference. |
| Scope inheritance on Ask-created objects | Needs replacement → fixed | `useIntentHandler` inserted without `organization_id`, so a workspace turn could write a personal row. Every insert now goes through `withScope`. |
| Refresh without reload | Live | React Query invalidation on the surfaces that own those objects. |

## Visual identity

| Area | State | Note |
| --- | --- | --- |
| Ambient backdrop + skins | Reusable | One fixed five-layer system, room-keyed position, idle dimming, reduced-motion honoured. |
| Per-room identity | Missing → added | One graffiti wall per room: Today rolling shutter at dawn, Work rail-yard wall, Ask wet alley, Receipts paste-up wall, Settings maintenance door. Art behind content, heaviest at edges, centre clear. |
| Typography | Live | Rubik human copy, Space Mono machine state. |
| Reduced motion | Live | Single authoritative guard; every new layer is listed in it. |
| Mobile 384px | Live | Validation target held through this pass. |

## Deliberately not done

- No fifth room, no second AI surface, no per-capability screens.
- No live vision, no real-time scene understanding, no frame-level video claims.
- No schema changes; work state reuses existing tables.
- No graffiti behind body text, no looping animation over reading zones.

## After

- Quick Ask is shell-native at both ends; the floating bubble is gone.
- Ask can file waiting items, decisions and artifacts — and they land in the right scope.
- Each room now reads as its own wall while staying one city.
