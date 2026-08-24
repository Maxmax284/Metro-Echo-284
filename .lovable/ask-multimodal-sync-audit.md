# Ask Synchronization + Multimodal Composer — Audit

Baseline before the overhaul. Vocabulary: **Live**, **Partial**, **Reusable**,
**Missing**, **Deferred**.

## Thread and context

| Area | Status | Where |
| --- | --- | --- |
| One thread engine for room + widget | Live | `providers/AskThreadProvider.tsx`, `lib/askThreads.ts` |
| Thread scope isolation | Live | `threadMatchesScope`, scope-filtered `conversations` |
| Context binding from any surface | Live | `hooks/useAskContext.ts`, `components/ask/AskAboutButton.tsx` |
| Bound context shown to the user | Missing | widget showed only `on <surface>`; no context strip |
| Bound object travels back to its record | Missing | context chip was not clickable anywhere |
| Thread outputs / aftermath chips | Live | `outputChips`, `ThreadSpine` |
| Continue in Ask promotion | Live | `lib/askPromotion.ts`, widget header |

## Composer and input

| Area | Status | Where |
| --- | --- | --- |
| Single composer component | Reusable | `components/shell/ConversationDock.tsx` (used by room and widget) |
| Text send + streaming + stop | Live | `ConversationSurface.send`, `ProcessingLine`, writing caret |
| Slash tool palette | Live | dock palette over `COMPANION_TOOLS` |
| File attach | Partial | attach existed, but no accept types, no camera, no per-kind meaning |
| Camera capture | Missing | no capture input anywhere in Ask |
| Voice | Live | Web Speech dictation in the dock; `VoiceCaptureCard` for capture |
| Attachment presentation | Partial | `StagedFileChips` is vertical-leaning and upload-centric |
| Attachment readability honesty | Missing | nothing said which types Vanta can actually read |
| Video understanding | Deferred | attach accepts it; Vanta says it cannot watch video yet |
| Drag and drop | Live (global) | `GlobalDropZone`, `ClipboardImageIntake` |

## Capabilities and routing

| Area | Status | Where |
| --- | --- | --- |
| Tool registry with scope/mode/provider gating | Live | `lib/companionTools.ts`, `getToolAvailability` |
| Required input type / device support in registry | Missing → added | `requiredInput`, `devices` on `Tool` |
| Capability router (perception / retrieval / research / Sherlock) | Reusable | `_shared/orchestration/capabilityRouter.ts` |
| Private-context sanitization before external calls | Reusable | `_shared/orchestration/sanitizeQuery.ts` |
| Suggestions derived from context | Missing → added | `lib/askCapabilities.ts` |
| OCR / document extraction | Live | `files-ingest`, `documents-extract` |
| Research | Live | `research-run` (+ normalization seams) |

## Presentation

| Area | Status | Where |
| --- | --- | --- |
| Structured blocks + inline approval | Live | `StructuredResponse.tsx`, `InlineApprovalActions.tsx` |
| Progressive block landing | Live | staggered keyframes in `StructuredResponse` |
| Floating bubble as primary quick-Ask trigger | Partial → replaced on desktop | `CompanionWidget.tsx` edge trigger |
| Mobile sheet partial/full | Live | Drawer at 80dvh / 95dvh |
| FLIP travel | Live | `lib/flip.ts`, `useFlipEntry` |
| Typography and skin system | Live | Rubik + Space Mono, `lib/skins.ts`, `AmbientBackdrop` |
| Reduced motion | Live | `motion-reduce` guards, `lib/motionPrefs.ts` |

## Tests already covering this ground

`ask-threads`, `ask-promotion`, `scope`, `navigation`, `capture-routes`,
`file-intake`, `orchestration`. New: `ask-capabilities`.

## Deliberately not in this slice

Video understanding, a fifth room, any execution path from Ask, and a rewrite of
the thread engine or block renderer.
