# Street-Tech Visual Polish Pass — Audit + Changes

Goal: Vanta should read as a custom command rig — dark, precise, a little
industrial — while staying mature, readable and fast. No new features, no new
tabs, no schema or workflow changes.

## 1. Current visual identity (before)

Strengths
- One card surface (`.vanta-card`), one HSL token palette, zero raw hex in components.
- Motion already had a shared vocabulary (`src/lib/motion.ts` + `index.css` primitives)
  under a single authoritative `prefers-reduced-motion` guard.
- Room transitions, per-room scroll memory and a leading nav indicator already worked.

Weaknesses found
- P1: All four rooms looked identical. Today, Work, Ask and Receipts shared the
  same flat card stack, so nothing signalled which room you were in.
- P1: No hero. Today opened with a bare `<header>` on the page background, so the
  most important state in the product had the least visual presence.
- P1: The purple `--accent` token existed but was effectively unused — cyan
  `--primary` carried navigation, intelligence, status and branding at once, so
  colour had stopped meaning anything specific.
- P2: Every dark surface was perfectly flat, which reads as generic dark-mode SaaS.
- P2: Nav markers were soft pills (`rounded-full`, `w-0.5`) — friendly, not machined.
- P2: Desktop had no depth response on interactive cards; hover was colour-only.
- P2: Ask's processing state was honest but visually thin (three dots, no presence).
- P3: `rounded-lg`/`rounded-xl`/`rounded-md` were mixed at similar nesting depths.

## 2. Surface levels (now explicit)

Four levels, and that is all:

```text
page background      body + --gradient-ambient
surface / card       .vanta-card
inset row / panel    .vanta-inset      (new)
elevated overlay     dialogs, sheets, popovers
```

Depth now comes from tone and one inset hairline, not from stacking borders.

## 3. What changed

### Tokens (`src/index.css`)
- `--vanta-accent` — the intelligence accent (purple), light-mode variant included.
- `--gradient-hero` — one controlled purple wash for the Today state area only.
- `--noise` — inline SVG grain, opt-in per surface, never global.

### New primitives
- `.vanta-hero` — hero treatment: purple wash + grain + 42s ambient drift.
- `.vanta-grain` — texture layer at 0.035 opacity, `overlay` blend, no movement.
- `.vanta-inset` — the inset row/panel level.
- `.vanta-hover-lift` — desktop-only 1px lift, gated behind `(hover: hover) and (pointer: fine)`.
- `.vanta-signal` — the one reusable "Vanta noticed something" motif: a 1px purple
  line that sweeps once and settles. Event-driven, never looped.
- `.motion-snap` — crisp 180ms mechanical settle, no overshoot.
- `.motion-signal-track` — the Ask processing track; mounted only while a request
  is genuinely pending.

All of them are listed in the single `prefers-reduced-motion` block, and each
degrades to a static state that still communicates the same thing.

### Room energy
- **Today** — hero-led and calm. The header is now a `.vanta-hero .vanta-grain`
  panel, headline at 26px / `-0.02em`. The signal line fires once when the change
  count genuinely increases, then clears.
- **Work** — operational and crisp. Project rows and desk tiles moved to
  `.vanta-inset` with tighter corners and desktop hover lift.
- **Ask** — open. Structured responses arrive once as a placed object; processing
  shows a purple signal track instead of a generic spinner.
- **Receipts** — stable. The only motion is a genuinely new receipt arriving,
  tracked by id so nothing already seen animates again.

### Accent discipline
Purple now means Vanta's own intelligence and nothing else:
- Ask room nav marker and icon glow
- Ask processing indicator
- Scope-switch acknowledgment sweep
- Today hero ambient wash

Cyan stays operational. Green/amber/red keep their existing status meanings.

### Nav markers
Square-cut 2px bars (`rounded-[1px]`) replacing soft pills, in both the mobile
bottom bar and the desktop rail.

## 4. Deliberately not done
- No global grain, no glow on non-signal elements, no neon.
- No looping animation anywhere except the Today hero drift (42s, one area).
- No per-workspace recolouring.
- No copy changes, no data-model changes, no new surfaces.
- No decorative purple on operational status.

## 5. Validation
`bunx tsgo` clean. Full vitest suite green. Verified at 384px and desktop width,
including a reduced-motion pass.
