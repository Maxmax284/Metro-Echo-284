// useLiveGps — a foreground-only GPS watch, started by a tap.
//
// Doctrine: nothing watches in the background. The watch runs only while the
// page is visible and the person has switched it on; it stops when the tab
// hides, when Today unmounts, or on the next tap. Readings are shown, never
// written — saving a place still goes through recordDeviceFix from a tap.
import { useCallback, useEffect, useRef, useState } from "react";

export type GpsLock = "off" | "search" | "lock" | "lost" | "denied" | "unsupported";
export type LiveFix = { lat: number; lon: number; acc: number | null; at: number };

const PREF = "vanta.today.gpslive";

export function useLiveGps() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem(PREF) === "1"; } catch { return false; }
  });
  const [lock, setLock] = useState<GpsLock>("off");
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [beats, setBeats] = useState(0);
  const [now, setNow] = useState(Date.now());
  const watchId = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (watchId.current != null) navigator.geolocation?.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setLock("unsupported"); return; }
    stop();
    setLock((l) => (l === "lock" ? l : "search"));
    watchId.current = navigator.geolocation.watchPosition(
      (p) => {
        setFix({
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          acc: Number.isFinite(p.coords.accuracy) ? p.coords.accuracy : null,
          at: p.timestamp || Date.now(),
        });
        setLock("lock");
        setBeats((b) => b + 1);
      },
      (err) => {
        if (err.code === 1) { setLock("denied"); stop(); setOn(false); }
        else setLock("lost");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
  }, [stop]);

  useEffect(() => {
    try { localStorage.setItem(PREF, on ? "1" : "0"); } catch { /* ignore */ }
    if (!on) { stop(); setLock((l) => (l === "denied" || l === "unsupported" ? l : "off")); return; }
    if (document.visibilityState === "visible") start();
    const vis = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); stop(); };
  }, [on, start, stop]);

  // Age ticker so "FIX 12S" stays honest between heartbeats.
  useEffect(() => {
    if (!on) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [on]);

  // A lock with no new heartbeat for 30s is no longer a lock.
  const ageS = fix ? Math.max(0, Math.round((now - fix.at) / 1000)) : null;
  const shownLock: GpsLock = on && lock === "lock" && ageS != null && ageS > 30 ? "lost" : lock;

  return { on, toggle: () => setOn((v) => !v), lock: shownLock, fix, beats, ageS };
}
