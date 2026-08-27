# Vanta comprehension system

The rules that keep the information layer as deliberate as the artwork. All of it lives in `src/lib/vantaNouns.ts`, `src/lib/errorCopy.ts`, `src/lib/roomCopy.ts` and four shared components.

## Canonical vocabulary

One object, one name. Defined in `CANONICAL_NOUN`:

| Object | Name | Lives in |
| --- | --- | --- |
| capture | Capture | Inbox |
| commitment | Commitment | Commitments |
| action | Action | Actions |
| decision | Decision | Projects |
| waiting | Waiting On | Work |
| artifact | Artifact | Documents |
| receipt | Receipt | Receipts |
| project | Project | Projects |
| responsibility | Responsibility | Work |
| thread | Thread | Ask |

Rules:

- A surface never writes an object noun by hand. It calls `canonicalNoun()`, `CANONICAL_NOUN`, or renders `<CardMeta>`.
- Historical synonyms (note, intake item, promise, proposal, staged action, document, audit entry…) are recorded in `NOUN_SYNONYMS` and resolve back to the one object.
- Section names may differ from object names. "Fresh in" is a section; the rows inside it are Captures.
- `src/test/comprehension.test.ts` fails the build when a synonym maps to more than one object or a canonical noun drifts.

## Card meta lines

`<CardMeta object state destination />` renders exactly one line:

```text
Commitment · due Fri · opens Commitments
Capture · needs review · opens Inbox · From Telegram
Action · needs approval · opens Actions
```

- Three facts maximum: type, state, destination. A source marker may be appended, nothing else.
- `state` must be plain English derived from a real record. No raw enum values.
- The line truncates. It never wraps to a second line at 384px.
- `opensIn={false}` for cards that unfold in place.

## Aftermath

`aftermathLine()` and `AftermathFooter` teach what happens next:

```text
Filed to Memory · appears in Receipts
Ran · appears in Receipts
Drafted to Actions · appears in Receipts
```

Use it when the action changes state, creates something, files something, or moves something. Never on trivial interactions like opening a panel or toggling a filter. Aftermath never executes anything.

## Provenance

One marker per row, from `resolveProvenance()`: From Telegram, From WhatsApp, From Email, From Calendar, Added by you, From an upload, From your website, Spotted by Sherlock, Recorded by Vanta. Rendered by `<ProvenanceChip>`. Nothing recorded means nothing rendered.

## Freshness

`<FreshnessLine at={...} />` says "Checked 4 min ago" / "Updated just now" / "Synced 12 min ago". Section or room header level only — never per row. The timestamp must be the epoch of a real read; there is no faked value.

## "Why am I seeing this?"

`<WhyThis reason={...} />` renders the reason the system already stored (nudge body, capture `why`). No reason recorded means no button. Vanta never generates an explanation to fill the slot.

## Errors

`readError(err, { doing })` returns `{ what, needsYou, fix, technical }`. `ErrorState` accepts `error` and `doing` and renders:

1. what broke, and whether anything changed
2. one available fix, named ("Try again", "Sign in again", "Open Connections", "Top up credits")
3. `technical` is kept for support and is not rendered by default

Status codes, function names, and cron names never reach a normal surface.

## Collapsed summaries

`summaryLine(object, count, detail, emptyLine)`:

```text
3 commitments · nearest Friday
2 captures · not sorted yet
6 receipts · newest first
```

A collapsed line must tell the user whether opening it is worth the tap. A bare count does not qualify.

## One thing open by default

Rooms compute a single `openSection` from real severity, in priority order: attention → dated today → unsorted captures → recent changes. Everything else collapses. The user's own fold choices still persist per panel.

## Empty sections

An empty section never renders header + note + empty card + zero count. Choose one:

- hide the section, and
- name it once in the grouped footer: `Nothing here yet: Commitments, Receipts, Inbox.`

Teaching empty states stay only where a first-time user genuinely needs the flow explained.

## Room headers

Room name, one state line, one compact control cluster (scope, freshness, fold sweep, Explain This). No intro paragraph, no second paragraph restating the headline, no stacked controls above the first real row.
