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

## Active pass — world context, place truth, universal reach

Done:

- World context spine: `_shared/judgment/worldContext.ts` turns the kept country
  notes, customs notes and emergency numbers into stamped facts on the existing
  world backbone, and a state/province row replaces the country row for the same
  topic (Virginia and DC tax, DC transit). A place with no notes contributes
  nothing rather than a generalisation.
- Place truth: `_shared/placeState.ts` fuses stated place, an allowed fix, the
  device clock, a filed journey, a calendar location and a nearby lookup into one
  role-aware read (home / temporary base / current / recent / transit /
  destination) across country → region → metro → locality → exact. Each source
  is capped at the precision it can honestly support, a day-old fix reads thin,
  and a contested level is spoken about by nobody: both readings are shown.
- Transition ledger: `_shared/placeTransitions.ts` records the coarsest move that
  actually happened plus airport arrivals and coming home. No breadcrumb trail,
  nothing recorded from a contested or thin read.
- One delivery rail: `_shared/delivery/rail.ts` plus the `deliveries` table.
  One event makes one dedupe key; the unique claim is what stops the same news
  buzzing on the phone and arriving on Telegram. Quiet hours hold anything short
  of critical, sensitive content gets privacy-safe lock-screen wording, and every
  reach or silence leaves a receipt.
- Notification actions: View / Later / Got it / Stop watching only. The service
  worker mutates nothing — it carries a status in the deep link, and
  `useDeliveryAck` applies it to the same situation inside the signed-in session.
- Ask environment edge: `WHERE · TZ | next thing`, from one shared read
  (`useEnvironmentEdge`), rendering nothing when nothing is known and showing a
  place disagreement instead of hiding it. Auto-generated pin names are treated
  as filenames, not places.
- Ask and Telegram read the same world and place evidence through the one gather
  path; empty evidence still produces an empty block.

Open in this pass:

- Travel proof walk (Virginia → airport → Tokyo layover → Thailand) against real
  filed journeys rather than fixtures.

## Work document engine — done

- Work now offers an evidence-grounded “From meeting notes” path alongside the
  existing templates. The person chooses Meeting brief or Follow-up memo, then
  explicitly selects notes and optional audit receipts.
- Source records are re-read and scope-checked on the server. Drafts use only
  those records, retain source IDs/markers, label missing facts “to be supplied,”
  and leave model, version, source, truncation and run receipts.
- Drafting uses the streaming Metro Echo AI path. A draft can take its time
  without a silent timeout; provider errors stay visible instead of becoming a
  fake answer.
- A ready draft lands in the existing Today/Work attention state. Telegram gets
  Review and Open in Work links when linked; opening the exact document clears
  the same nudge/delivery state. Opening is acknowledgement, never approval.
- Document waiting/settled vocabulary now matches real statuses: drafted waits;
  reviewed, approved and failed settle. No second receipt or document system.
- Type check is clean. Full suite: 1,715 tests across 174 files. Focused signal
  checks cover exact document links and reviewed/approved settlement.

## Presence and discovery polish — done

- The four room tabs now carry restrained context, attention, critical and
  completion signals derived from existing nudges, actions, receipts and Ask
  context. No fifth room or parallel attention system was added.
- First-use discovery bubbles are anchored to the room that needs explaining,
  dismiss themselves, remember dismissal, and open the exact situation where an
  existing anchor is available.
- Ask can disclose the real place, clock and calendar sources it is using and
  seed up to three situational questions into the existing composer. It states
  plainly when no live device location was requested.
- App, push and Telegram acknowledgements now refresh the same delivery state;
  Telegram notices use Got it / Later / Open and retain one delivery identity.
- Room movement is one-shot and settles; reduced-motion users get the same state
  without ongoing animation.
- Verified at 384px and 1440px with no horizontal overflow, including the Ask
  source disclosure and reduced-motion mode. Focused and full automated checks
  are green.

## Previous pass — street-smart substrate and phone doctrine

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


Left open then, resolved since:

- Notification actions are now live (low-consequence only). Badging, offline
  capture queue and contact picker remain seams only — see external blockers.

## Next approved expansion

No further expansion is approved. The remaining active proof is the real travel
walk listed above; broader document formats stay behind a fresh approval.

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

## Screenshot → flight truth (in progress, Sep 18)

- Booking-site trip number read off a screenshot, kept as provenance. DONE
- Settle a disagreement on the flight: keep the record, or accept the
  screenshot's version (writes the field, leaves a receipt). DONE
- Unclaimed flights get one airline lookup, inside the daily read budget. DONE
  (watcher reads once; "Look up the details" on the card.)
- A condition sentence around the evidence becomes one promise, on the person's
  word only. DONE
- Real photo forwarded in Telegram reads end to end (picture kept as evidence,
  text off the picture goes through the same flight reader). DONE — proven with
  a forwarded booking picture: one record, no double, receipt left.
- Proof: the real Telegram screenshots, in order.

- [ ] Keep flight cards visible during live refreshes; update facts in place without full-card dimming.
