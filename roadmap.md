# Roadmap

## Done this batch (verified live at 384px)
- [x] weather-tick edge function — hourly Open-Meteo refresh of conditions watches' Now line; rolls stop_at +14d while ground stays stamped (Samui lock-in); writes watches.telemetry_at
- [x] Migration: watches.telemetry_at + hourly pg_cron (vanta-weather-tick, 7 * * * *)
- [x] weather-station: place_id param (any stamped ground) + grounds mode (one call, all grounds)
- [x] WeatherStation: ground switcher chips, ?place= param
- [x] Today: GroundsWeatherStrip — every stamped ground's temp chip under the map
- [x] WatchDispatchSheet: live weather card (temp/feels/rain/instruments-checked) on weather watches
- [x] Telegram: suggested_summary persisted on voice/doc reads + photo looks; Arrivals + Captures show words not filenames

## Done this batch (verified live at 384px)
- [x] Documents one-breath intake — say/type the whole brief in NewDocumentDialog; documents-intake (Gemini flash, forced tool call) sorts it into template + fields; `intakeParse.ts` sieve drops invented keys, bad dates, unmatched selects; lands on the read-back — nothing drafts until the tap; `document.intake_parsed` receipt per sort

## Done this batch (Phase 1 cron repair — all 17 jobs verified firing)
- [x] All 15 previously unrecorded cron jobs written into migrations (record_cron_jobs) — repo can now rebuild the live backend; idempotent unschedule+schedule, timing preserved verbatim
- [x] weather-tick receipts — watch.sky_refreshed per refresh (place + lock-in flag), watch.tick_failed on write error; verified live (Ko Samui + Bangkok receipts written)
- [x] awareness-decay receipts — field_note.expired / correction.expired per row, never silent
- [x] config.toml parity — 7 missing verify_jwt=false entries (calendar-sync, awareness-decay, awareness-drift-sweep, sherlock-watch, sherlock-digest, weather-tick, journey-watch)
- [x] Fired all 15 cron-invoked functions by hand: all honest. calendar-sync "dead" was a false alarm (anon-Bearer test artifact; no-Authorization cron path syncs fine). gmail-sweep held on Google's API switch (external, user's console toggle)

## Next
- [ ] Phase 1 remainder: AskVantaBar→openAskContext binding, push through reach.ts floor gate, WatchDispatchSheet place_id, dead-function cleanup (intake-digest/entity-resolve/cadence-sweep), LIVE_FIX_SOURCES single export, stale-data labels

## Parked
- Phase 7 ecosystem inlets (GroundStay/CampCore/Fenrir) — shelved per Maxwell
- [x] Hourly auto-sweep for ALL conditions watches, not just Samui — resolveWatchPlace ladder (stamped ground → any named board place with coords → Open-Meteo geocode cached in api_cache); Bangkok flooding watch revived and now leads with Bangkok's own sky (32°C thunderstorm, "a place on your board"); flood(ing)?/monsoon added to WEATHER_WORDS both sides; Bangkok watch's poisoned essay query replaced with tight keywords
- [x] Weather station shelf on Work ("Skies on your grounds" — same grounds chips + °C/°F toggle as Today, teaching line, link to /weather) verified live at 384px
