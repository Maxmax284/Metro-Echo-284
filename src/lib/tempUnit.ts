// tempUnit — the one home for °C/°F across the whole app.
//
// The weather gauge owns the toggle; every other weather read shares the
// same setting and turns live when it flips. Project law: one helper, no
// per-component reimplementation. The choice is per device (localStorage),
// so a phone and a laptop can each read the way their owner thinks.
import { useEffect, useState } from "react";

export type TempUnit = "c" | "f";

const UNIT_KEY = "vanta.tempunit";
const listeners = new Set<(unit: TempUnit) => void>();

export function readTempUnit(): TempUnit {
  try {
    return localStorage.getItem(UNIT_KEY) === "f" ? "f" : "c";
  } catch {
    return "c";
  }
}

export function writeTempUnit(unit: TempUnit): void {
  try {
    localStorage.setItem(UNIT_KEY, unit);
  } catch {
    /* private mode — the session still hears the flip */
  }
  listeners.forEach((fn) => fn(unit));
}

export const toF = (c: number) => (c * 9) / 5 + 32;

/** The number in the chosen unit, rounded. */
export function tempIn(celsius: number, unit: TempUnit): number {
  return Math.round(unit === "f" ? toF(celsius) : celsius);
}

/** "86°F" / "30°C" — the unit letter always rides with the number. */
export function formatTemp(celsius: number, unit: TempUnit): string {
  return `${tempIn(celsius, unit)}°${unit.toUpperCase()}`;
}

/** The unit plus live updates: flip the gauge and every weather read turns. */
export function useTempUnit(): [TempUnit, (unit: TempUnit) => void] {
  const [unit, setUnit] = useState<TempUnit>(readTempUnit);
  useEffect(() => {
    const fn = (u: TempUnit) => setUnit(u);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return [unit, writeTempUnit];
}
