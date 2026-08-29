# Vanta next pass — audit before changes

Classification of every area touched by this pass. "Already strong" means it was left alone on purpose.

## Rooms and desks

| Area | Verdict | Note |
| --- | --- | --- |
| Today | Already strong | Single-panel priority, collapsible sections, jump strip, digest hook. Only addition: cross-device resume. |
| Work landing | Needed hierarchy | Opened as a directory: recent projects, then ten desks at one weight. Now opens with a briefing. |
| Work desks | Needed hierarchy | Daily/Knowledge/Deeper split reorganised into two shelves: where work lands, where Vanta looks. Routes unchanged. |
| Projects | Already strong | Status rail, time label, health. Now also leaves a hand-off trace when opened. |
| Inbox | Already strong | Captures/Notes/Files tabs, voiced empty copy. Files empty state rewritten to teach. |
| Commitments | Already strong | Teaching empty state, lifecycle, scope-filtered. |
| Actions | Needed history, confidence, honest undo | Added recorded life line, source note, and Undo only where `rollback_available` is true. |
| Briefs | Already strong | Presets and exports in place. |
| Documents | Needed explanation | Empty copy now says how a document gets there. |
| Schedule | Already strong | Day/Week/Month/Upcoming plus honest sync diffs. |
| Memory | Already strong | Search across everything, teaching empty state. |
| Sherlock | Already strong | Scope-isolated findings, teaching empty state, confidence values already stored. |
| Awareness | Already strong | Consent, posture, sensors. |
| Cockpit | Reusable | Dense reformat of records other desks own. Stays on the quieter shelf. |

## Primitives

| Primitive | Verdict |
| --- | --- |
| `card-meta`, `provenance`, `freshness`, `why-this` | Already strong, reused |
| `AftermathFooter`, `AftermathHint` | Reusable, coverage extended |
| `state-views` (loading/empty/error) | Already strong; three empty strings rewritten to teach |
| Inline object history | Missing → `src/lib/objectLife.ts` + `ObjectLife` |
| Confidence / inference labelling | Missing as a shared primitive → `src/lib/confidence.ts` + `ReadNote` |
| Undo / rollback exposure | Present in engine, dishonest in UI → gated on `rollback_available` |
| Cross-device context record | Present (`profiles.preferences.context`) but never surfaced → resume anchor + `CrossDeviceResume` |
| Scope filtering | Already strong; every new query goes through `applyScope` |
| Mobile 384px | Already strong on Today/Ask; Work reduced to one line per row |
| Reduced motion | Already strong via motion doctrine tokens |
| Tests | 481 green, three new suites added |

## Intentionally deferred

Wearables, camera input, continuous listening, spoken output, learned attention, plugin marketplace, gamification, calendar write-back, mailbox sync, WhatsApp capture. Seams documented, nothing built.
