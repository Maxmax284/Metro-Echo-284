# Front Door, Living World & Station Identity — Audit + Integration Plan

Read-only audit of the existing Metro Echo codebase (three investigation passes, file:line verified). No code, schema, or data changed. The short version: **most of this vision already exists and is live.** The real work is (a) one missing arbiter so the ceremonies stop being independent, (b) the front-door spray/Auth moment, and (c) a region tier for world atmosphere. Everything else is extension, not construction.

---

## 1. EXISTING REALITY

### Front door chain
| Area | State | Evidence |
|---|---|---|
| PWA cold launch | **LIVE** | `public/manifest.webmanifest` complete (standalone, `#0c1014` bg/theme, 192/512/maskable icons, shortcuts, share_target). `index.html:8-18` forces dark before JS. icon-512.png is the chrome M. Pre-JS splash is OS-rendered and static by nature — correct to keep. |
| Pre-JS → app handoff | **PARTIAL** | No inline splash markup; `Index.tsx:182-187` loading state is a bare spinner. Dark theme means no white flash, but the first branded frame is React-late. |
| Auth screen | **LIVE** | `src/pages/Auth.tsx` — email + Google, sets `data-room="door"` (`:22-30`) for the shutter-wall look, sets `BOOT_ENCORE_KEY` before both paths (`:50,64`). Errors are **toast-only** — no terminal-style failure state. |
| Session handling | **LIVE** | `src/lib/auth.tsx`, brokered storage (`previewAuthStorage.ts`). OAuth return pages exist (`src/pages/oauth/GoogleReturn.tsx`, `GoogleCalendarReturn.tsx`). |
| Boot sequence | **LIVE** | `src/lib/bootSequence.ts` (pure) + `BootSequence.tsx`: speaks only verified facts (place+freshness, clock, cached weather, operational state), honest `NO SIGNAL`/`NEW GROUND`/`READING` unknowns, skips on deep link or pressure (`decideBoot:48-59`), micro 340ms reopen, full 6.5s hold (~7s with shutter), 2.2s reduced-motion. The 7s full boot is a deliberate user-set duration — **do not shorten it.** |
| Intro (once/account) | **LIVE** | `introSequence.ts` + `IntroSequence.tsx` + `useIntroGate.ts`, gated on `profiles.preferences.intro_seen_at`; burns the sign-in encore and records a boot so no second ceremony fires. |
| Dawn shutter | **LIVE — third ceremony** | `src/lib/skins.ts:101-109` + `index.css:1774-1824`: once-per-day rolling shutter on arrival at Today, keyed `vanta.shutter.day`, independent of BootSequence's own `boot-shutter` CSS (`index.css:2433-2464`). Two shutter animations with adjacent naming already exist. |
| Ceremony arbiter | **MISSING — the key gap** | Three independent welcome animations (intro per-account, boot per-cold-open, dawn shutter per-day) avoid stacking only coincidentally, via separate keys (`intro_seen_at`, `BOOT_AT_KEY`/`BOOT_ENCORE_KEY`, `vanta.shutter.day`). A spray-can reveal would be a **fourth independent layer** unless a single gate sequences them. |
| Today entry | **LIVE** | `SignalBeacon.tsx` — twin lamps, SolariWord drum, real GPS lock states, sonar ping per real fix. No fake states. `SolariWord` is the shared split-flap primitive across Boot/Intro/DeskTransit/SignalBeacon/SolariBoard. |
| Desk transit | **LIVE** | `DeskTransit.tsx` + `deskTransit.ts` — Solari dispatch overlay, turnstile sound, 420ms min hold. |

### World / atmosphere stack
| Area | State | Evidence |
|---|---|---|
| Solar/season/moon | **LIVE, canonical** | `src/lib/station.ts` — pure on-device math: lat band, hemisphere flip, season, moon (synodic), daylight (declination), daypart, zone clocks. No network. Does NOT do weather, place names, or region facts. |
| Weather | **LIVE** | Open-Meteo via `awareness-snapshot` edge fn through `apiGuard` (kill switch, rate limit, `api_cache` TTL, usage logs). `sky.ts` + `SkyChannel.tsx` write `data-sky`, clear on stale (3h) — never repaints stale. `data-sky` (meteorological) vs `data-weather` (task pressure, `weather.ts`) cleanly separated. |
| Weather duplicate | **DUPLICATED** | `FieldPolaroid.tsx:104-109` fetches Open-Meteo **directly from the browser**, outside apiGuard/api_cache — a second ungoverned weather path. Flag for consolidation. |
| Place truth | **LIVE** | `AwarenessProvider.tsx:132-142` — live place is only `geo.source = device`; saved places never usurp. `useLiveGps.ts` foreground-only, opt-in, never writes. |
| Atmosphere layers | **LIVE, 5 channels** | `data-room` (graffiti room walls), `data-weather`, `data-sky`, `data-lat-band`+`data-daypart` (procedural region tint, global), `data-place` (painted wall skins). CSS-owned consequences in `index.css`. Compose cleanly, no owner conflicts. |
| Place skins | **PARTIAL — scaling bottleneck** | `placeWalls.ts:11-15` — hardcoded 3 cities (Taipei/Bangkok/Tokyo), painted assets, hard-win over tint. The only per-city mechanism today; not a scalable pattern. |
| Curiosity Cabinet | **LIVE** | `CuriosityCabinet.tsx` — 6 dials (moon, daylight, season ring, home clock, signal = device self-report, travel counter). On-device, 60s tick, tap-to-teach provenance, teaches instead of guessing when no fix. |
| Occasions | **LIVE** | `occasions.ts` — 4 countries seeded (TH: Songkran, Loy Krathong via moon; US ×3; JP ×2; TT Carnival via computus). Opt-in per device (`vanta.occasions.on`), never fires on stale fix, boot stamp motif with tone. Scaling = pure data addition. |
| Welcome stamps | **LIVE** | `stamped_at` + `WelcomeStamp.tsx`, audit receipts (`place.stamped`/`place.stamp_lifted`), boot echo within 30km on fresh fix only, `placePatchForFix` clears stamp on real move. Tested. |
| Local Help & Care | **LIVE** | `LocalHelpCard.tsx` on the Place board — country-keyed emergency numbers (fixed table, never dialed), live-board-only care lookup (`useCareNearby` gated by `boardIsLive`), kept pins on all boards. |
| Country data | **LIVE, flat** | Three ISO-2 tables sharing one doctrine (hand-checked, dated, "no match = honest nothing"): `countryFacts.ts`, `localHelp.ts`, `occasions.ts`. **No region tier exists.** |
| Reverse geocode | **LIVE** | Nominatim primary + Photon fallback + Overpass sanity cache, all server-side. |

### Sound / motion / prefs / receipts / privacy
| Area | State | Evidence |
|---|---|---|
| Sound | **LIVE** | `streetSound.ts` — 8 sounds incl. **spray**, turnstile, clack, stamp, solari, zippo; mp3 + synth fallback; first-gesture arming; binary device-local on/off (`vanta.sound.v1`). No OS-silent detection (platform handles it). |
| Theatre × quiet hours | **MISSING** | `main.tsx:12-20` arms sound/daylight/flick unconditionally. Nothing gates theatre on quiet hours or crisis state. Boot skips on pressure, but ambient sound/motion doesn't know. |
| Motion | **LIVE** | `motion.ts` vocabulary, `motionPrefs.ts` (3 presets + custom, CSS vars), single `reducedMotion.ts` helper, ~25 CSS kill-switch blocks, GPU-conscious `flick.ts` (refuses reduced-motion), `daylight.ts` wall. |
| Preferences | **LIVE** | `profiles.preferences` JSON (account-level) + deliberate device-local localStorage split (sound/motion/skin/occasions). Note: two writers (`useUserPreferences`, `VantaContextProvider`) read-merge-write the same column — be careful adding more. |
| Receipts | **LIVE, reusable** | `audit_log` (generic entity/event/payload) + `ReceiptSlip` thermal UI + fold pattern (`heldBack.ts`). A station archive needs **no schema change** to prototype: new event type + new fold + existing slip. |
| Field Notes | **PARTIAL** | `field_notes` table with geo/weather/season context exists; writes from feedback/signals; read only via Memory intake feed + corrections. **No dedicated surface, no aftermath line, no route to Work.** |
| Privacy pre-auth | **LIVE, clean** | `/auth` + `/what-is-metro-echo` render no location/weather/live data. GPS foreground-only, opt-in, shown never written. Public page copy already disclaims tracking. |

**Better than expected:** the Solari primitive, spray sound, stamp receipts, occasion engine, region tint, and 5-layer atmosphere CSS are all already built to exactly this doctrine. **Conflicts:** the missing ceremony arbiter, two shutter animations, FieldPolaroid's rogue weather fetch, and placeWalls' 3-city ceiling.

---

## 2. INTEGRATION MAP — canonical sources (no parallel truth)

| Concern | Canonical source | Rule for new work |
|---|---|---|
| Auth/session | `AuthProvider` + `Auth.tsx` + brokered storage | Spray reveal lives on `/auth`, uses existing encore key |
| Current/last-known place | `AwarenessProvider` (`geo.source = device`) | Never read place from anywhere else |
| Weather | `awareness-snapshot` + `api_cache` → `data-sky` | Atmosphere reads `data-sky`; consolidate FieldPolaroid onto it |
| Solar/daypart/moon/season | `station.ts` only | Region tier consumes it, never re-derives |
| System readiness | `bootSequence.ts` facts + `weather.ts` (task pressure) | Boot already speaks it — don't add a second readiness read |
| Today commitments | Today surface / `useGlance` / roomSignals | Theatre defers to pressure via existing `decideBoot` urgent path |
| Connectivity | Device self-report (`navigator.onLine`, `effectiveType`) | Never probe |
| Receipts/provenance | `audit_log` + `ReceiptSlip` + fold pattern | Station archive reuses all three |
| Sound prefs | `vanta.sound.v1` (device-local) | Spray respects it; no new sound system |
| Motion prefs | `motionPrefs` + `reducedMotion()` | All new animation honors both |
| **Ceremony sequencing** | **NEW: `src/lib/ceremonyGate.ts` (pure) + storage keys** | The one new abstraction: decides which of intro/spray/boot/dawn-shutter plays per landing, at most one theatre layer at a time |
| **Region atmosphere** | **NEW attribute channel (e.g. `data-region`) + hand-seeded region table** | Extends the existing 5-layer attribute stack; does not touch the other layers |

The pattern to copy for the region table is the existing country-table doctrine (`countryFacts`/`localHelp`/`occasions`): flat array, ISO keys, hand-checked rows, graceful nothing.

---

## 3. END-TO-END STORYBOARD (all states real)

```text
COLD LOGGED-OUT LAUNCH
OS splash (static chrome M, #0c1014) → JS wakes → /auth (data-room="door" wall)
→ ceremony gate: first visit on this device? SPRAY REVEAL (rattle → two-pass
  mist → drip, tap-to-skip, ≤3.5s, sound honors vanta.sound.v1)
→ repeat visit: ESTABLISHED TAG (M already on wall + sub-1s chrome sweep)
→ reduced motion / quick return: STATIC MARK, form instantly usable either way

AUTH
Email/Google tap → turnstile clack → encore key set →
  success: shutter/transition into boot (see below)
  failure: AUTH REJECTED strip (terminal red, human-readable error preserved,
           no toast-only) — form stays put

GOOGLE OAUTH RETURN
Redirect home → encore key intact → full roll call (never reads as reopen)
→ no fake success: boot runs only after session confirmed

SUCCESSFUL ENTRANCE
Gate sequences ONE ceremony: intro (once/account) OR boot (cold/first-of-day)
→ roll call speaks verified state: METRO ECHO → KO SAMUI (or LAST KNOWN /
  NEW GROUND) → ALL CLEAR / NEEDS A LOOK / NEEDS YOU / NO SIGNAL / READING
→ shutter lifts → Today. Dawn shutter suppressed today (gate already spent
  the ceremony budget on the boot).

QUICK REOPEN
Gate: micro nod (340ms) or straight through. No spray, no shutter, no roll.

OFFLINE / LIMITED
Boot: NO SIGNAL drum, "nothing here claims to be current." Static M. No spray
audio fetch failures (synth fallback already exists).

REDUCED MOTION
Static M, no spray, 2.2s boot or none, CSS kill-switch already app-wide.

TRAVEL DAY (authenticated, stamped ground, occasion opt-in)
Boot: place drum + "stamped ground" echo (fresh fix, <30km) + occasion stamp
motif (e.g. Songkran tone) → Today. Urgent pressure? Boot skipped entirely,
Today paints immediately.
```

---

## 4. WORLD IDENTITY ARCHITECTURE

Hierarchy with graceful fallback, reusing what exists:

```text
GLOBAL (always)        → procedural: data-lat-band + data-daypart tint (LIVE)
COUNTRY (ISO-2)        → reverse-geocoded, cached on the place row (LIVE)
                         → occasions/facts/help tables (LIVE, flat)
REGION (NEW)           → hand-seeded region table per country code
                         (coastal / northern-mountains / capital-metro / plains…)
                         → drives ONE new attribute: data-region
                         → CSS paints silhouettes/light mood per region class
                         → no row = silent fallback to country/band (same
                           doctrine as occasions: unmapped = honest nothing)
CITY (rare, opt-in)    → placeWalls painted skins (LIVE, 3 cities)
                         → stays the exception, not the pattern
```

- **Computed locally:** band, season, daypart, moon, daylight, region class lookup (pure table read). Zero network for atmosphere.
- **Network (cached):** weather (Open-Meteo via api_cache, 3h stale-clear), reverse geocode (place row). Region rides the existing place row's country — no new fetch.
- **Pre-auth privacy:** door room renders band-neutral global identity only; no place name, no coordinates, no region attribute until signed in. Already true today; the gate enforces it for spray/boot too.
- **Performance:** atmosphere stays CSS-attribute-driven (gradients, a few SVG silhouettes). No per-country image packs, no video, no canvas loops. 384px/60fps target, battery-neutral (the existing flick/daylight patterns are the ceiling).
- **Severe weather** stays operational truth (existing alert/pressure paths), never a decorative storm theme.

---

## 5. OPTIONAL IDEAS — every one labeled

| Idea | Label | Why |
|---|---|---|
| Full fresh-tag spray reveal | **BUILD EARLY** (Stage 1) | The ask. Sound + reduced-motion + skip infra all exist. |
| Established Tag (chrome sweep) | **BUILD EARLY** (Stage 1) | The repeat-visit variant; same build, cheaper path. |
| Static Mark | **BUILD EARLY** (Stage 1) | Reduced-motion/quick-return fallback; trivial once gate exists. |
| Replayable cinematic in Settings | **KEEP OPTIONAL** | Small add to Feel settings; do after Stage 1 proves out. |
| Shutter entrance auth→shell | **BUILD EARLY, as consolidation** | Two shutter animations already exist (`boot-shutter`, `vanta-shutter-lift`). Merge into one mechanism via the gate; don't add a third. |
| AUTH REJECTED terminal state | **BUILD EARLY** (Stage 1) | Replaces toast-only failure; small, high value. |
| Per-region station environments | **BUILD LATER** (Stage 3) | Region table + `data-region` CSS. Samui/Bangkok/DMV/Tokyo classes first, then seed more regions as data. |
| Weather-modified atmosphere (rain/dawn/night) | **BUILD LATER** (Stage 3) | `data-sky` + `data-daypart` already exist; this is CSS extension, not new plumbing. |
| Snow/fog atmosphere variants | **KEEP OPTIONAL** | CSS-only once Stage 3 lands; add when a seeded region needs it. |
| Cultural station editions | **BUILD LATER** (Stage 4) | `occasions.ts` already fires the motif; extend it to a temporary visual edition (window decal/ticket-stamp style), opt-in inherited. |
| Personal milestones/occasions | **KEEP OPTIONAL** | Explicit opt-in only; trips data exists. Not before Stage 4. |
| Cabinet: platform clock, radio dial, weathered window, bulletin | **KEEP OPTIONAL** (Stage 5) | Cabinet already has 6 dials; add max 1–2, rotation not pile-up. Bulletin must read real notices only. |
| Station archive / journey stamps | **BUILD LATER** (Stage 6) | Reuses audit_log + ReceiptSlip + welcome-stamp infra; deliberate save only, no route history, no schema change to prototype. |
| Field Beacon / SOS | **DEFER — pinned** | Compatibility check: no conflicts found (boot echoes stamps, beacon would be its own consented session; live-GPS rule already matches its doctrine). Untouched by all stages. |
| Meet Me There (multi-user/social) | **DO NOT BUILD** | Deferred by doctrine; social coordination is out of scope for the companion. |

---

## 6. IMPLEMENTATION STAGES

The brief's proposed sequence assumed stages 2–6 were greenfield. They aren't — boot readiness (2), cultural layer (4), cabinet (5), and stamp/archive plumbing (6) are substantially **already live**. Re-sequenced to reality:

- **Stage 0 — this audit.** Done.
- **Stage 1 — Ceremony gate + front door.** `ceremonyGate.ts` (pure, tested): one theatre layer per landing, sequences intro/spray/boot/dawn-shutter, honors quiet-hours/pressure. Spray-can reveal on `/auth` (once per device → established tag → static mark; tap-skip; sound-pref aware). AUTH REJECTED strip. Consolidate the two existing shutter animations into one gated mechanism.
- **Stage 2 — Boot polish only.** Boot already speaks real readiness — residual work is wiring the gate's suppression rules and killing the FieldPolaroid duplicate weather fetch (route through snapshot/api_cache).
- **Stage 3 — Region atmosphere tier.** Region table (country→regions, hand-seeded, graceful nothing) + `data-region` channel + CSS environment classes (island-coastal, capital-metro, northern-mist, brutalist-metro…). Weather/daypart mood via existing attributes.
- **Stage 4 — Cultural station editions.** Extend `occasions.ts` motifs into temporary visual editions. Inherit opt-in; remembrance stays quiet.
- **Stage 5 — Cabinet rotation.** 1–2 new dials max (platform clock, bulletin-if-real), rotation rules so it never piles up.
- **Stage 6 — Station archive.** Journey stamps as audit events + ReceiptSlip + a fold in Receipts. Deliberate saves only.

No Field Beacon work in any stage.

---

## 7. ACCEPTANCE / REGRESSION TESTS

All visual checks at 384px Android viewport, real PWA install + mobile browser, plus the existing suite staying green:

1. Cold PWA launch: static M, dark, no white flash pre-JS.
2. Spray plays once per device; repeat logged-out visit gets established-tag sweep; quick return gets static.
3. Tap-to-skip works at every moment of spray/boot; auth form usable instantly in all variants.
4. Failed login: AUTH REJECTED strip + human-readable error; no toast-only path.
5. Google OAuth round trip: continuous, full roll call after return, no fake success.
6. No two ceremonies stack on any landing (spray+boot, boot+dawn-shutter, intro+anything) — gate test matrix.
7. Reduced motion: static M, no spray, 2.2s-or-less boot, zero animation.
8. Sound off / silent device: complete silence, visuals intact.
9. Offline: NO SIGNAL boot, no invented weather/place, synth audio fallback.
10. Stale weather: sky attribute clears, boot omits weather, cabinet teaches.
11. Unknown location: NEW GROUND, no region attribute, no guessed atmosphere.
12. Different station: change place → region/atmosphere follows on next paint; saved-board views never borrow live context.
13. Low-power/reduced data: no new network calls for atmosphere (verify via network log).
14. Pre-auth surfaces render zero location/place/commitment data.
15. No background GPS added (code review + permissions audit).
16. Frame-rate sanity on 384px during spray + shutter (no jank on the solari drum).
17. Today/Work/Ask(Echo)/Receipts regression pass; desk transit unaffected.
18. Built ≠ deployed ≠ published ≠ device-verified — each stage reports which.

---

## 8. RISKS / THINGS TO NOT SCREW UP

- **Ceremony stacking** (highest risk): four independent welcome animations would be a slot machine. The gate comes first or the spray doesn't ship.
- **Gimmick creep:** spray every login = noise by week two. Once-per-device + established-tag repeat is the discipline.
- **Per-city spaghetti:** placeWalls is 3 cities and fine as an exception. Do not grow it; the region tier is the scalable path.
- **Duplicate weather path:** FieldPolaroid's direct Open-Meteo fetch bypasses kill switches and cache — consolidate before building atmosphere on weather.
- **Quiet-hours theatre:** sound/motion currently ignores quiet hours; the gate must own suppression or the spray becomes a 3am airhorn.
- **Prefs clobbering:** two writers already read-merge-write `profiles.preferences`; don't add a third without care. Ceremony state stays device-local like sound/motion.
- **Timing honesty:** the 7s boot is user-chosen — don't quietly shorten it; the brief's 1.2–1.8s target applies to *transitions*, not the roll call.
- **Pre-auth leak:** atmosphere must stay band-neutral until session confirmed.
- **Performance:** CSS-attribute atmosphere only; no canvas rain, no video walls, no per-country asset packs on mobile data.

---

## 9. FINAL RECOMMENDATION

Narrowest first build: **Stage 1 — ceremony gate + spray-can front door.** It's the only genuinely missing piece of the front-door vision, it fixes the stacking risk before it exists, and it reuses live infra (spray sound, Solari, encore key, reduced-motion, sound pref) for everything except the gate and the reveal itself.

Approval sentence to copy later:

> "Approve Stage 1: build the ceremony gate (one welcome animation per landing) and the spray-can front door on /auth — once per device, established-tag on repeat, static under reduced motion, tap-to-skip everywhere, AUTH REJECTED failure strip, and the two existing shutters consolidated under the gate. No other stages yet."

## Technical details

- New: `src/lib/ceremonyGate.ts` (pure, unit-tested — same pattern as `bootSequence.ts`), device-local keys alongside `vanta.sound.v1`; `src/components/shell/SprayReveal.tsx` (CSS/SVG mask animation, `SolariWord`-family styling, `streetSound.play("spray")`).
- Touch: `Auth.tsx` (spray mount + AUTH REJECTED strip), `Index.tsx` (gate in the ceremony slot), `skins.ts` (dawn shutter consults gate), `BootSequence.tsx` (reports to gate).
- No schema changes, no new tables, no new edge functions, no secrets. Field Beacon untouched.
