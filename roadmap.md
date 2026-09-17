# Metro Echo — roadmap

Current truth, current doctrine, current pass. Not a history log. Past plans and
receipts live in `.lovable/plan/` and the audit trail; nothing there is rewritten.

## Current truth — what is live

- Four rooms: Today / Work / Ask / Receipts. Read-only Schedule desk, `/flights`
  board, agenda board with live day rail, Documents, Local help, Money desk.
- One Echo, one brain: `vanta-converse` (Ask) and `telegram-webhook` (Telegram)
  share the same reads, abilities, voice and judgment substrate.
- Capture: notes, voice, files, share target, email/forwarded material, Telegram.
  Capture never executes.
- Calendar: read-only feed sync every 5 minutes plus approved Google writes.
  Realtime refresh into an open day rail.
- Flights: filing from a flight number, journeys, layover math, airport context,
  live Aviationstack readings (40-read daily cap, travel window only), gate and
  delay changes filed into Today and optionally pinged to Telegram.
- Everyday life: currency, local help via Google Maps first, country notes,
  care directory, housing synthesis, body observation (read-only).
- Awareness pipeline: signal → relevance → urgency → suppression → bundling →
  delivery, with quiet hours and an attention budget.
- Receipts and audit on every state change.

## Current doctrine

- Four rooms only. New capability feeds an existing room.
- Capture first, interpret second, never rewrite the original evidence.
- Extraction is not execution. Consequential action needs a deliberate yes and
  leaves a receipt.
- Source disagreement is shown, not smoothed. Unknown stays unknown.
- Silence is a valid answer.
- Street smart means practical judgement and restraint, not slang and not
  hardcoded assumptions.
- Exception, proven live: an exact calendar proposal may be approved, rejected or
  cancelled from the same linked Telegram chat and message, under strict chat and
  message binding. Nothing else executes from messaging.

## Active pass — street-smart substrate and phone doctrine

Done:

- Shared judgment substrate in `supabase/functions/_shared/judgment/`:
  situation sense and provenance, situation archetypes (internal, expiring),
  consequence and interruption eligibility, friction comparison, "what bit me
  before" experience with origin and shelf life, rhythm with decay, platform role
  map, world-context backbone, answer composition. One prompt block, empty when
  there is no evidence.
- Substrate wired into Ask and Telegram through one gather path.
- Telegram reference hardening beyond calendar: words beat vague pronouns, a
  crowded field asks once, working pointers expire after 30 minutes, two
  independent asks in one message are separated instead of mashed together,
  refinement and typed approval refuse to guess between two pending changes.
- Phone: home-screen shortcuts for Today, Ask, Receipts, Flights and Body;
  `?room=` deep link into the exact room.
- Wearables, one body in one place: the hand-off now accepts nineteen kinds of
  reading with phone-name aliases and per-group consent (everyday body numbers,
  movement, sleep); the Body desk carries the fortnight strips, a self-reported
  body profile (phrasing only, never a target) and the device link; Work has a
  Wearables tile. Recorded rest and effort feed judgment as a friction input.
  Native Apple Health / Health Connect reads stay a documented seam.


Open in this pass:

- Badging, offline capture queue, contact picker and notification actions remain
  seams only — see external blockers.

## Next approved expansion

The everyday-life expansion plan dated 2026-09-16 (`.lovable/plan/`), starting
with Phase A World Context. Do not start it without a go.

## External blockers

- Money: real bank credentials. Plaid rail is sandbox-only.
- WhatsApp: Business number and API approval.
- Badge, contact picker and offline file/audio capture: unreliable or absent
  platform support on the current target. Documented, not faked.
- Native shell: `capacitor.config.ts` points at the published URL; no committed
  ios/android project. No native rewrite planned.

## Pinned later

- Home-screen widget ("2 things need you" / "CLEAR · Next: …"). Contract only.
- Full world-context fact coverage beyond the backbone.
