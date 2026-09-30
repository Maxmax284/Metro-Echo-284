// useStationHum — the low station hum under the main rooms.
//
// The hum rides Today, Work and Receipts only; Ask is a conversation and
// stays quiet. It follows the street-sound switch (SOUND_EVENT) and the
// tab's visibility, and it never makes a sound before a real touch wakes
// the audio (streetSound handles that gate).
import { useEffect } from "react";
import { HUM_ROOMS, SOUND_EVENT, soundOn, startHum, stopHum } from "@/lib/streetSound";

export function useStationHum(surface: string) {
  useEffect(() => {
    const sync = () => {
      if (HUM_ROOMS.has(surface) && soundOn() && document.visibilityState === "visible") startHum();
      else stopHum();
    };
    sync();
    window.addEventListener(SOUND_EVENT, sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener(SOUND_EVENT, sync);
      document.removeEventListener("visibilitychange", sync);
      stopHum();
    };
  }, [surface]);
}
