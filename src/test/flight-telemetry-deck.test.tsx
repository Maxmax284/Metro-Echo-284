import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlightLive } from "@/components/schedule/FlightLive";
import type { LiveFlight, LivePosition } from "@/lib/flightStatus";

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" });

function reading(position: LivePosition | null): LiveFlight {
  return {
    flight_no: "TG6285",
    flight_date: "2026-09-19",
    airline: "Thai Airways",
    status: "active",
    departure: {
      airport: "Dulles",
      iata: "IAD",
      terminal: null,
      gate: "B49",
      scheduled: "2026-09-19T05:15:00Z",
      estimated: null,
      actual: "2026-09-19T05:20:00Z",
      delay_min: null,
    },
    arrival: {
      airport: "Taoyuan",
      iata: "TPE",
      terminal: null,
      gate: null,
      scheduled: "2026-09-19T21:10:00Z",
      estimated: null,
      actual: null,
      delay_min: null,
    },
    position,
    checked_at: new Date().toISOString(),
  };
}

describe("the deck with real telemetry", () => {
  it("prints altitude, speed and heading from the airline's fix", () => {
    render(
      <FlightLive
        live={reading({
          updated: new Date().toISOString(),
          lat: 50,
          lon: -90,
          altitude_m: 10668,
          heading_deg: 300,
          speed_kmh: 900,
          vertical_kmh: 0,
          on_ground: false,
        })}
        checkedAt={new Date().toISOString()}
        clock={clock}
        homeZone="America/New_York"
      />,
    );
    expect(screen.getByLabelText("35,000 ft")).toBeTruthy();
    expect(screen.getByLabelText("559 mph")).toBeTruthy();
    expect(screen.getByLabelText("300° WNW")).toBeTruthy();
    expect(screen.getByText(/Radar fix 50.00, -90.00/)).toBeTruthy();
  });

  it("says plainly when the airline filed no fix", () => {
    render(
      <FlightLive
        live={reading(null)}
        checkedAt={new Date().toISOString()}
        clock={clock}
        homeZone="America/New_York"
      />,
    );
    expect(screen.getByText(/No radar fix from the airline yet/)).toBeTruthy();
  });

  it("keeps the full deck visible and uses only a small cue while refreshing", () => {
    const { container } = render(
      <FlightLive
        live={reading(null)}
        checkedAt={new Date().toISOString()}
        clock={clock}
        homeZone="America/New_York"
        reading
      />,
    );

    const deck = container.querySelector('[data-reading="true"]');
    expect(deck).toBeTruthy();
    expect(deck?.classList.contains("animate-pulse")).toBe(false);
    expect(screen.getByText("Checking airline")).toBeTruthy();
    expect(screen.getByText("TG6285")).toBeTruthy();
    expect(screen.getByText("B49")).toBeTruthy();
  });
});
