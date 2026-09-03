# Work: expand clarity and visible usefulness

Same four rooms. Same desks. No new autonomy. Every idea below is presentation, teaching, or an AI assist that only *drafts a suggestion you tap*.

One shared pattern applied to every desk, so learning one desk teaches all of them.

## The desk pattern (the strongest idea)

Every Work desk gets the same five-part skeleton, in this order, top to bottom:

```text
1  Desk line        What happens here, one sentence + the verb ("File what came in")
2  Do this          3-5 verb-first taps, the recommended one marked
3  Vanta can help   1-3 assists, each labelled "prepares a draft, you approve"
4  The desk         Real records — or, when empty, a Sample card + "how one gets here"
5  What happens next  One line: where a record goes after you touch it
```

Rules that keep it from bloating:
- Parts 1 and 3 collapse to a single line once the desk has records (learned once, then out of the way).
- Part 3 never appears if there is nothing for it to read.
- Roadmap / "coming soon" text is always last and always behind a fold.
- On 384px: one column, 44px taps, sample card is one card, never a carousel.

## Sample cards: teach the shape, not the paragraph

The single biggest fix for bare desks. Each empty desk shows one greyed, clearly-labelled **Example** card built to look exactly like a real record on that desk — same layout, same status chip, same footer — with a corner tag reading "Example — nothing is saved" and a caption "This is what one looks like after you route a capture."

- Inbox example: a forwarded quote, source chip "Email", buttons shown but dimmed.
- Commitments example: "Send Nikki the schedule — due Friday", with the promise-to line.
- Actions example: a drafted reminder with the Approve / Discard pair visible and disabled, plus "Nothing runs until you tap Approve."
- Projects example: a project row with 3 attached items and a freshness stamp.
- Briefs example: a thumbnail of the first paragraph of an operator brief.
- Documents example: an NDA row with two flagged clauses.

Same component, per-desk copy. No fake rows in real lists — examples live in the empty state only and disappear the moment a real record exists.

## Per-desk expansion

### Actions (the barest, biggest win)
Right now it says "Nothing waiting on you" and stops. Add:
- **Where drafts come from** — a three-step strip: something arrives → Vanta drafts a step → you approve. Each step taps through to the desk that owns it.
- **What Vanta may draft for you** — a short list of the draft types that actually exist today (reminder message, commitment from a capture, project link suggestion, document revision), each with "waits for your approval".
- Example approval card as above.
- When populated: a promoted "oldest waiting" row with age, and an explicit "1 of 3 waiting" counter so you know the queue depth without scrolling.

### Inbox
- **Route bar** on the first unsorted item: File to project · Make it a promise · Keep as note · Discard — one row, four taps, no menu dive.
- **Vanta can help**: "Suggest where these belong" (proposes a project per item, you accept each one) and "Group what looks related". Suggestions render as a chip on the row reading "looks like: Lamai rollout" with Accept / Not it.
- Source filters gain counts, and read "Telegram 3" not just "Telegram".
- Empty state: the three doors (type it, upload, send from phone) with the *true* status of the phone door.

### Projects
- Each project row gains a one-line **living state**: "4 attached · 1 promise due Fri · quiet 6 days".
- **Vanta can help**: "Summarize where this project stands" (drafts the brief, you read it) and "Suggest what to attach" from unrouted captures.
- Empty state: example project + "Start one and anything you capture can be attached to it."

### Commitments
- Split visibly into **You owe** / **Owed to you** / **Coming due** with counts — the promise direction is currently invisible.
- Row shows: what, to whom, when, and how it got here (typed / spotted in a capture, labelled as inference).
- **Vanta can help**: "Find promises in what I captured" (proposes, you confirm each) and "Draft the follow-up message" (draft only, sending stays a separate approval).

### Briefs
Today it is mostly a form. Make the formats **show themselves**:
- Each format becomes a card with a two-line preview of what that brief actually reads like, plus who it is for and roughly how long.
- **Recently made** sits above the format picker once anything exists.
- **Vanta can help**: "Build this from the last 7 days" — pre-fills the source selection, still one tap to generate, still nothing leaves Vanta until you export.

### Documents
- Reorder: what works now first (templates, create-from-memory, review an upload), roadmap second and folded.
- Rename the banner from "under construction" to what is true: "Drafting and review work now. Cross-document analysis and obligation tracking are next." One line, low key.
- Template cards get a one-line "use this when" and a two-line preview of the opening clause.
- **Vanta can help**: "Read this and flag what's missing" on upload; "Explain this clause in plain English" on a selection. Both read-only.

### Schedule, Memory, Sherlock, Awareness, Cockpit
Same skeleton, lighter: desk line, 2-3 taps, one example, one "what happens next". They already read well; they just need to match the pattern so nothing feels like a different product.

## The integrations warning banner

It currently shouts on every Work visit. Change to: one small chip in the header ("2 integrations need attention") that opens the detail. Full-width red only when something the user actually uses has stopped working.

## What is confusing / too bare / over-explained right now

- **Actions is dead air.** The rule is stated, the mechanism is invisible. Worst offender.
- **Briefs is a settings screen.** Seven format names with no idea what any of them produce.
- **Documents leads with its own incompleteness.** The useful parts are below the apology.
- **Work is over-explained at the tile level.** Each tile already carries verb + hint + "use when" + quick actions + recommended step — four lines of teaching per tile, times seven tiles. Collapse to verb + hint + one recommended step; move the rest into the "?" panel and the desk itself.
- **Three numbered tiers plus a fold plus a briefing plus a body line plus a physical-loop panel** is a lot of chrome above the desks. Tier labels can lose the numbers, and Tier 1 should collapse to a single briefing line once you have read it today.
- **Commitments hides direction.** "What was promised" does not say by whom.
- **Inbox source filters have no counts,** so you cannot tell which door is busy.
- **Empty states differ in tone across desks** — some explain, some just report emptiness.

## Guardrails held throughout

- Every AI assist produces a labelled draft or suggestion with Accept / Not it. Nothing sends, books, pays, files, or approves on its own.
- Inference is always labelled on the card.
- Example cards are visually unmistakable and never written to the database.
- No new room, no new store, no new navigation model.
- 384px is the layout target; every tap ≥44px.

## Suggested order if we build it

1. Actions (bare → useful) and the shared Example card component.
2. Inbox route bar + source counts.
3. Briefs previews, Documents reorder.
4. Commitments direction split.
5. Tile de-cluttering + banner demotion.
6. The remaining reading desks fall in line with the pattern.
