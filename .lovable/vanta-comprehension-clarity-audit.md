# Vanta Comprehension & Clarity Audit

Scope: the information layer only. Four rooms, street identity, and every backend system stay exactly as they are.

Legend: **Good** · **Inconsistent** · **Missing** · **Over-explained** · **Under-explained** · **Reusable** · **Consolidate** · **Deferred**

## Copy and vocabulary

| Area | Finding | Verdict |
| --- | --- | --- |
| `roomCopy.ts` (`ROOM_INTRO`, `ROOM_EXPLAIN`, `SECTION_NOTE`) | Single source, jargon-tested, already wired through `SectionNote` | **Good / Reusable** |
| `plainLabels.ts` | Strong event humanizer, banned-token scrubber, `eventWhere()` already maps object → room | **Reusable** |
| Object nouns | Same object is called capture / note / fresh in / intake item depending on surface. `eventWhere` says "Promises", `workLabels` says "Commitment", Today says "note" | **Inconsistent → Consolidate** |
| Action nouns | staged / proposed / draft / pending approval all reach the UI | **Inconsistent → Consolidate** |
| `workLabels.ts` | Project status + time wording is grounded and consistent | **Good** |

## Cards

| Area | Finding | Verdict |
| --- | --- | --- |
| Card metadata | No shared meta-line component exists anywhere. Each row invents its own `label + meta` pair | **Missing** |
| "What happens if I tap" | `AftermathFooter` carries a tap hint, but is used in only 5 files (Sherlock finding, Captures view, Cockpit briefing, Connected accounts) | **Under-explained** |
| Provenance | Source is recorded in payloads and inferred in a few surfaces, but there is no compact shared source marker | **Missing** |
| Badges | Today rows lean on colour + arrow rather than words for state | **Under-explained** |

## Sections and rooms

| Area | Finding | Verdict |
| --- | --- | --- |
| `CollapsibleSection` | Fold state persists, room-wide sweep event exists, folded summary slot exists | **Good / Reusable** |
| Collapsed summaries | Some say something useful ("1 item is waiting on you"), some are just counts | **Inconsistent** |
| Default open state | Nearly everything defaults open; several sections compete for first attention | **Consolidate** |
| Empty sections | Today's "What's next", "What changed", "Fresh in" each render header + note + empty card + zero count when empty. `secondaryQuiet` covers only the all-quiet case | **Over-explained** |
| Today header | Hero has label, scope badge, Explain This, headline, state-of-day line, activity trace, tick row, Ask bar, Quick modes, then a full expand/collapse row before the first real item | **Over-explained → Consolidate** |
| Work header | Compact already: label, sync stamp, Explain This | **Good** |
| Receipts header | Compact, has Explain This | **Good** |
| Freshness | `SyncStamp` exists and is used in Work, but Today and Receipts never say when they last looked | **Missing** |

## System state

| Area | Finding | Verdict |
| --- | --- | --- |
| "Why am I seeing this?" | Already implemented in `NoticedRow`, rendering the stored nudge body | **Good** |
| Connector health | `computeStatus` + `STATUS_LABEL` exist per integration, but Settings has no single one-line read | **Missing** |
| Errors | `aiErrors.ts` gives good plain copy for AI gateway failures only. Other surfaces still show raw `e.message` (e.g. "Work could not load.") | **Inconsistent → generalize** |

## Structure and help

| Area | Finding | Verdict |
| --- | --- | --- |
| Explain This | Grounded, free, hands off to Ask. No link to a structural map | **Under-explained** |
| "What does what" map | `HowVantaWorksSection` lives buried in Settings → Getting started; not reachable from a room | **Consolidate** |
| Cockpit | Five distinct panels (bulletin, checklist, productivity pulse, project rollups, operations briefing). Reviewed separately in `.lovable/vanta-density-review.md` | **Deferred** |

## Mobile, accessibility, tests

| Area | Finding | Verdict |
| --- | --- | --- |
| 384px | Rows already use `min-h-[44px]`, truncation, and shrink-0 metadata. New meta lines must truncate, not wrap to three lines | **Good, guard it** |
| Reduced motion | `--feel-k` / `feelMs()` and reduced-motion degradation already in place | **Good** |
| Focus / labels | `vanta-focus`, aria labels, and `sr-only` text are consistently applied | **Good** |
| Tests | 411 passing. `room-clarity.test.ts` guards notes and jargon. Nothing guards nouns, meta lines, freshness, or error copy | **Missing** |

## Do not rebuild

Section notes, helper familiarity, collapsible panels, the panel sweep, `plainLabels`, `workLabels`, `eventWhere`, `SyncStamp`, `NoticedRow`'s why-line, and the receipt unfold are all healthy. This pass adds the missing primitives and enforces one vocabulary on top of them.
