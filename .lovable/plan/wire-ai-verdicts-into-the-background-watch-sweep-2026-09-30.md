# Wire AI verdicts into the background watch sweep

Every check — cron or Check now — makes Echo actually read the reporting and speak a verdict, instead of comparing URLs and stamping a raw headline.

## What changes

**1. One shared sitrep brain**
- Move `sitrepFrom()` out of `web-look/index.ts` into `_shared/sitrep.ts` so `web-look` (question time) and `watch-sweep` (every check) use the identical synthesis: Gemini reads the filtered hits, speaks a 2–3 sentence ground-truth verdict, conclusion first, no invented facts.
- SerpApi stays as the eyes (it fetches the pages); the AI is the brain that reads them. Junk-domain blacklist already applies before the AI ever sees a hit.

**2. The sweep reads, not just compares** (`watch-sweep/index.ts`, `web_search` path)
- Cheap pre-filter stays: if the URL fingerprint hasn't moved, the check stays quiet and costs zero AI calls.
- When the results moved (or on a watch's first real check), the sweep calls the shared sitrep and stores the verdict:
  - `last_read` = the AI verdict → the radar's "Top of the board" and the dispatch slip show real ground truth, never a raw headline again.
  - The change outcome + nudge title = the verdict's first line, replacing "New pages are showing for '…'".
  - `success_when.hits` keeps the top source titles for provenance.
- AI unreachable? Fall back to today's behavior (top hit title + template line). A failed synthesis never blocks or fails a check — the sweep always lands.

**3. Receipts stay honest**
- `watch.checked` / `watch.needs_you` audit events already fire; the verdict rides the same rail. Quiet hours and notification floors unchanged — an important verdict still waits for morning unless it punches through.

## What you'll see

- Tap **Check now** on the Bangkok watch → beam sweeps → the slip reads an actual verdict ("RID holding the Chao Phraya at Bang Sai; pumps running in eastern districts; rain easing Thursday") instead of a WhatsApp banner or a template sentence.
- The Today nudge when something moves says what moved, not "new pages are showing."

## Technical notes

- Files: new `supabase/functions/_shared/sitrep.ts`; edits to `watch-sweep/index.ts` (web_search branch) and `web-look/index.ts` (import the shared helper, delete local copy).
- Model: `google/gemini-2.5-flash` via the AI Gateway — same as the existing question-time sitrep, per your call.
- Cost shape: AI runs only when results actually change (or first check); quiet checks are pure SerpApi compares.
- Tests: extend the watch/web-look suites for the shared helper — fallback on gateway failure, empty hits, verdict formatting.
- Deploy `watch-sweep` + `web-look`; verify live at 384px with a forced check on a real watch.
