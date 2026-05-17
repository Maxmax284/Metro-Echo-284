# Stages 3b + 4 + 5 — HUD port · Sherlock scopes · Memory filters

## 3b — Awareness tab HUD port
- `AwarenessSurface.tsx` prepends `<AwarenessHUD />` and a quick-generate row of section chips (per AWARENESS_SECTIONS) → calls `generate(s)` from the provider.

## 4 — Sherlock surface
- Scope chips (all / notes / commitments / actions / awareness / files) prefix the question with a `[Scope: …]` hint before invoking `sherlock-investigate`.
- Target cards: recent commitments / notes / actions; tap to auto-seed question + scope.
- Per-investigation Maximize icon → `openSherlock({ entity_type: "freeform", … })` overlay reuse.
- Structured dashed empty state with radar glyph.

## 5 — Memory substrate
- Search hits get type-filter chips (All / Notes / Messages / Commitments) with per-kind counts.
- Filtered + zero states with dashed border + iconography.
- Notes empty state upgraded with Inbox icon + capture hint.

## Notes
- No schema, edge function, or provider changes.
- HUD remains the same component on both surfaces; provider is the binding layer.
- Stages 6 (Street Signal) + 7 (Motion + Mobile) remain.
