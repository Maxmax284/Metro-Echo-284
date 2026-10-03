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

## Next
- [ ] Telegram capture bridge (the front door — voice/photo/text → draft card in Today)

## Parked
- Phase 7 ecosystem inlets (GroundStay/CampCore/Fenrir) — shelved per Maxwell
- [x] Hourly auto-sweep for ALL conditions watches, not just Samui — resolveWatchPlace ladder (stamped ground → any named board place with coords → Open-Meteo geocode cached in api_cache); Bangkok flooding watch revived and now leads with Bangkok's own sky (32°C thunderstorm, "a place on your board"); flood(ing)?/monsoon added to WEATHER_WORDS both sides; Bangkok watch's poisoned essay query replaced with tight keywords
- [x] Weather station shelf on Work ("Skies on your grounds" — same grounds chips + °C/°F toggle as Today, teaching line, link to /weather) verified live at 384px
