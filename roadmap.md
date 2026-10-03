# Roadmap

## Active: Telegram capture polish + weather/watch expansion

- [ ] weather-tick edge function — hourly Open-Meteo refresh of conditions watches' Now line; renews stop_at (+14d) while ground stays stamped (the Koh Samui lock-in); sets watches.telemetry_at
- [ ] Migration: watches.telemetry_at column + hourly pg_cron job calling weather-tick
- [ ] weather-station: place_id param (any stamped ground) + grounds mode (one call, all grounds' current temps)
- [ ] WeatherStation page: ground switcher chips, ?place= param
- [ ] Today: grounds weather strip — every stamped place's temp + condition, tap → /weather?place=
- [ ] WatchDispatchSheet: live weather card (temp/feels/rain windows) for weather-ish watches
- [ ] Telegram: persist suggested_summary on voice/doc reads + photo looks; Arrivals lane + CapturesView show words not filenames
- [ ] Deploy functions, trigger first tick, verify Samui watch stop_at extended + fresh Now line live at 384px

## Parked
- Phase 7 ecosystem inlets (GroundStay/CampCore/Fenrir) — shelved per Maxwell
- Documents station intake polish (voice revise, multi-turn) — next after this batch
