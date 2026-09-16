# Metro Echo — Everyday Life Expansion (plan only)

Audited against the live repo after the review PDF. Nothing here starts without your approval, and each phase gets its own approval before the next begins.

## What the audit found already live (so we don't rebuild it)

- **Currency**: live rates, parsing ("120 usd to thb"), formatting, cross-rates. Live.
- **Local emergency numbers**: hand-kept per place. Live.
- **Country notes**: hand-written transport / money / watch-out lines, each stamped with the day it was checked, "no notes" when a country isn't written up. Live (TH, JP, others).
- **Travel**: flight filing by number + day, provider status reads with a hard daily ceiling, journeys with legs, derived position ("you're in Tokyo"), layover math with terminal-change and immigration subtraction, airport food/water/SIM/pharmacy/rest/ATM listings with a 7-day cache and last-read stamps, arrival reads, Telegram parity, drop/cancel. Live.
- **Care directory**: hospitals, clinics, pharmacies with expanding-radius search. Live.
- **Weather**: already used as situational context around appointments and the evening read. No dashboard. Live.
- **Capture**: timer, pause/resume, waveform while recording, mark-a-moment, timestamped segments, evidence jump, cross-note search, structured view, three mic modes. Live. Speaker fields exist but are never claimed as separation.
- **Money rail**: bank linking, balances and transactions built end to end, sandbox keys only, zero accounts linked.
- **Body**: medication and dose scheduling live, one watch reporting, read-only.

**Genuinely missing**: measurement and unit sense, sizing, plugs/voltage, driving side, date and clock formats, phone codes, tipping and tax-included pricing as first-class facts, phrases, transit-payment norms; friction reasoning; the street-smart trouble lane; housing cost synthesis; capture import/export/audio keeping; WhatsApp; deeper ambient surfaces.

## Order (revised from your draft)

Your A–H order holds, with two changes justified by the repo: **street-smart help moves ahead of travel refinement** (travel is the most finished lane, street-smart is the emptiest and highest value), and **housing lands before body** because the money phase feeds it directly.

```text
A World context      → B Street-smart + friction + culture → C Travel polish
D Read-only money    → E Housing / real cost               → F Body
G WhatsApp           → H Ambient depth
```

---

## Phase A — World context and international practical sense
**Size: medium.**

Adds one shared "how things work here" layer under Ask and Today: measurement conversion with meaning, temperature, distance, weight, volume, area, clothing and shoe sizing where genuinely reliable, date and clock format, phone codes, plugs and voltage, driving side, fuel units with a comparable per-unit price, SIM and eSIM context, transit payment norms, tipping and whether tax is already in the price, and a small phrase set.

The point is context, not arithmetic: "42 m² is about 452 ft² — small by US suburban standards, normal for a city apartment." The judgement half only appears when a kept fact supports it. Silence beats a guess.

- **Reuses**: currency, country notes, local help, the place spine, the capability router, Ask, Telegram.
- **New sources**: none required. Sizing, plugs, driving side and formats are kept facts with a checked-on date, same discipline as country notes.
- **Visible**: answers in Ask and Telegram, and a one-line "what Echo knows about here" in the Ask suggestions. No tools menu, no converter page.
- **Proof**: pure-module tests for every unit family and every kept-fact table, plus refusal tests — unwritten country returns nothing.

**Approval checkpoint before B.**

## Phase B — Street-smart everyday help, friction, and local sense
**Size: large.** The main lane.

Lost wallet, dead phone, missed train, ATM ate the card, card declined abroad, hotel or taxi problem, locked out, missing package, outage, flat tyre, broken appliance, doctor vs clinic vs pharmacy, printing/notary/mail, government offices, lost passport, baggage and refunds, "is this fee normal", "am I being tourist-priced", "what's the least stupid option right now".

Answers come back as real tradeoffs — cheapest, fastest, least hassle — and only when current facts support them. Friction counts: distance, transfers, closing times, your own schedule. "The bus saves $4 but adds 55 minutes and two transfers. The taxi is the practical move." The tradeoff is always shown; the recommendation is never dressed up as objective.

- **Reuses**: care directory, local help, country notes, Phase A, public web look/read, the watch seam, Ask, Telegram.
- **New sources**: none mandatory. Official and local authoritative pages before broad web.
- **Not built**: no calling anyone for you, no cancelling a card, no filing a claim, no emergency escalation. Echo prepares; you act.
- **Proof**: scenario tests per situation, friction-math tests, "no supportable answer" tests.

**Approval checkpoint before C.**

## Phase C — Travel polish (only what's missing)
**Size: small.**

Gate and terminal change notices where the source carries them, leave-time reasoning that uses live traffic-free route timing already in place, time-zone transition handling, weather impact on a leg, "what changed while you were in the air" on landing, public baggage and rebooking information, and trip documents pulled from mail and files you already connected.

- **Reuses**: journey, airport intel, flight status budget, calendar sense, mail and file reading, watches.
- **Not built**: airline login, check-in, seat selection, buying, holding.

## Phase D — Read-only money
**Size: medium.** Blocked externally until real bank credentials exist; sandbox proves the shape.

Balances, transactions, recurring expenses, deposits and income, subscriptions, known bills, spending patterns, a normal baseline, simple cash-flow context. "Did that deposit land?" "What changed?" "Can I realistically afford this?" "What can wait?"

- **Permission model**: per-account consent, read scopes only, tokens never leave the server rail, money data never joins a public-web answer, revoke wipes derived context.
- **Not built**: transfers, payments, investing, trading, autonomous anything. Not a Finance Room.
- **Proof**: never sum across currencies, never treat a missing balance as zero, pending excluded, descriptive language only.

**Approval checkpoint before E.**

## Phase E — Housing and what living somewhere really costs
**Size: large.**

One question: what does living here actually cost per month? Rent, deposit, utilities, internet, commute, fuel or transit, furnishing, move-in fees, taxes, parking, HOA, laundry, maintenance, contract length, penalties, inclusions, grocery and gym and clinic access, noise, flood or weather exposure where sourceable, internet reliability, lease clauses, address and registration implications. Landlord responsiveness comes from your own evidence only — never an invented reputation.

- **Reuses**: Phase A, care directory, route timing, notes and documents, money context when connected.
- **Visible**: a comparison answer with a per-line source, in Ask. No housing dashboard.

## Phase F — Body context
**Size: medium.** Fenced.

Sleep, training, recovery, caffeine, hydration, activity, nutrition, wearable signals — observation only. "You slept less, trained harder, and had more caffeine than usual." No diagnosis, no invented biomarkers, no scores.

## Phase G — WhatsApp
**Size: medium.** Blocked on a Business number and API access.

Another door to the same Echo. Same rules, same approvals, same receipts, no WhatsApp brain, no assumption of full personal message history.

## Phase H — Ambient depth
**Size: large, last.**

Phone stays primary, desktop for deep work, watch for glance / ack / defer / capture, earbuds for short spoken exchanges later, glasses much later and deliberately — never always-watching. No command-centre fantasy.

---

## Capture (runs alongside, small pieces)

Core is built. Only these, and only honestly: audio and video and file import, keeping the original audio if storage stays clean, export and share, richer bookmarks, transcript search improvements, evidence-linked summaries, Ask and Telegram retrieval of past captures, and linking a captured decision to a situation or to Work as a proposal. Real speaker separation and better live transcription only if a provider can actually do it — otherwise they stay unbuilt and Echo keeps saying so.

## Laws that hold across every phase

Private connected sources first. Official and local authoritative sources before broad web. Disagreement between sources shown, not smoothed. No fake certainty. No silent or always-on location. No automatic emergency escalation. No money movement. No health diagnosis. Consequential actions need your yes. Every real action leaves a receipt. Capture first, interpret second, never rewrite the original. Extraction is not execution.

## How people find any of this

By asking. Contextual suggestions in Ask, "what can Echo do?" answering honestly including what it can't, one line of guidance right after a connection lands, "why this?" on anything inferred, and Today only when there's a consequence. No tools menu. No new rooms — Today, Work, Ask, Receipts stay the whole map, and anything new lands as a desk under one of them.

## Risks

Kept facts going stale (every line carries its checked-on day), quota burn on new providers (same ceiling discipline as flights), sounding confident about culture (source or stay quiet), and scope creep into eight half-built lanes. One front at a time.

## External blockers

Real bank credentials for D. A WhatsApp Business number and API approval for G. A trustworthy diarization provider for that one capture item. Everything else needs nothing from anybody.
