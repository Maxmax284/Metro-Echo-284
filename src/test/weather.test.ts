import { describe, expect, it, beforeEach } from "vitest";
import { applyWeather, currentWeather, deriveWeather } from "@/lib/weather";

const base = { overdue: 0, attention: 0, captures: 0, securityAlert: false, noticed: false };

describe("shell weather", () => {
  it("reads calm when nothing is overdue or waiting", () => {
    expect(deriveWeather(base)).toBe("calm");
    expect(deriveWeather({ ...base, captures: 2 })).toBe("calm");
  });

  it("reads drift when something is waiting or noticed", () => {
    expect(deriveWeather({ ...base, attention: 1 })).toBe("drift");
    expect(deriveWeather({ ...base, noticed: true })).toBe("drift");
    expect(deriveWeather({ ...base, captures: 5 })).toBe("drift");
  });

  it("reads pressure for overdue promises or security signals", () => {
    expect(deriveWeather({ ...base, overdue: 1 })).toBe("pressure");
    expect(deriveWeather({ ...base, securityAlert: true })).toBe("pressure");
    // Pressure wins over drift.
    expect(deriveWeather({ ...base, overdue: 1, attention: 4 })).toBe("pressure");
  });

  beforeEach(() => {
    document.documentElement.removeAttribute("data-weather");
    document.documentElement.classList.remove("vanta-exhale-once");
  });

  it("writes the weather onto the document root", () => {
    applyWeather("drift");
    expect(currentWeather()).toBe("drift");
  });

  it("exhales only when settling into calm from something worse", () => {
    applyWeather("calm");
    expect(document.documentElement.classList.contains("vanta-exhale-once")).toBe(false);
    applyWeather("pressure");
    applyWeather("calm");
    expect(document.documentElement.classList.contains("vanta-exhale-once")).toBe(true);
  });
});
