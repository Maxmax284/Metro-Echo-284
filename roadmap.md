# Consolidation pass — status

## Done
- [x] 1. One action path. `_shared/actionStaging.ts` + `useStageAction` own every action row.
      Risk words normalised to `low_reversible|standard|high`; scope (organization_id) always stamped;
      guard tests fail the build on a raw insert or a rejected risk word.
- [x] 2. One depth model + one urgency ladder. `responseDepth.ts` owns body -> verbosity
      (`VERBOSITY_FOR_BODY`, `bodyForChannel`); `deviceCompression.ts` is a renderer only and
      re-exports the awareness urgency ladder. Retired `fyi/meaningful/needs_you`.
      Telegram form added to formsAgree.
- [x] 3a. Telegram keeps its own conversation thread (`telegramConversation`), bound to the linked
      chat, created on first message. No more borrowing the newest desk thread / dropping new users.
- [x] 8. Provider names out of user-facing copy (Gemini / Lovable AI / SerpApi / Open-Meteo).
      "Sherlock failed" replaced with the doctrine failure shape.

## Open
- [ ] 3b. Telegram reuses the Ask capability router + working-context assembly (retire the parallel
      tool list in the webhook).
- [ ] 3c. Telegram uploads through the shared ingestion pipeline (PDF/DOCX/voice groundwork).
- [ ] 4. One place spine (merge the two geocode/nearby implementations, one precision policy).
- [ ] 5. Today hierarchy pass (one "What changed" owner, one agenda owner, less launcher clutter).
- [ ] 6. Aware room prove-it pass at 384px against real records.
- [ ] 7. What Vanta can see: six rows + one summary sentence, reusing existing readers.
- [ ] 9. Motion consolidation (retire legacy animations conflicting with the motion grammar).
- [ ] 10. Ask <-> widget continuity (no reset on expand).
- [ ] 11. Route consolidation: /watch /motion /glance /wearables /wearable-loop /physical-loop /how
      /awareness/location folded into the four rooms or retired.
