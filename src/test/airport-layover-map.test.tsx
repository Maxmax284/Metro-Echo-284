import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AirportLayoverMap } from "@/components/schedule/AirportLayoverMap";
import { airportLayoverFacts } from "@/lib/airportLayoverMap";
import type { Layover, Leg } from "@/lib/journey";

vi.mock("@/components/schedule/AirportLayoverMapInner", () => ({
  AirportLayoverMapInner: ({ iata }: { iata: string }) => <div data-testid="airport-map">Map for {iata}</div>,
}));

const layover: Layover = {
  iata: "TPE",
  place: "Taipei (TPE)",
  gapMin: 180,
  usableMin: 110,
  deductions: [],
  terminalChange: "yes",
  arriveTerminal: "2",
  departTerminal: "1",
  border: "different",
  canLeaveAirport: false,
  words: "Connection time on record.",
};

const nextLeg: Leg = {
  plan_id: "tg637",
  order: 1,
  flight_no: "TG637",
  airline: "Thai Airways",
  from: { iata: "TPE", at: "2026-09-20T07:55:00Z", basis: "scheduled", terminal: "1", gate: "B1R" },
  to: { iata: "BKK", at: "2026-09-20T11:00:00Z", basis: "scheduled", terminal: null, gate: null },
  live_checked_at: "2026-09-20T06:00:00Z",
  filed_status: "scheduled",
  override: null,
  override_note: null,
};

describe("airport layover map", () => {
  it("keeps airport geometry separate from filed terminal and gate facts", () => {
    const facts = airportLayoverFacts(layover, nextLeg);
    expect(facts.point).not.toBeNull();
    expect(facts.onwardTerminal).toBe("1");
    expect(facts.onwardGate).toBe("B1R");
  });

  it("lazy-opens a real airport map and names unavailable geometry honestly", async () => {
    render(<AirportLayoverMap layover={layover} nextLeg={nextLeg} />);
    expect(screen.queryByTestId("airport-map")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /airport map/i }));
    expect(await screen.findByTestId("airport-map")).toHaveTextContent("TPE");
    expect(screen.getByText(/onward: terminal 1 · gate B1R/i)).toBeTruthy();
    expect(screen.getByText(/walking distance unavailable/i)).toBeTruthy();
    expect(screen.getByText(/taxi-out distance unavailable/i)).toBeTruthy();
    expect(screen.getByText(/labels, not map pins/i)).toBeTruthy();
  });

  it("does not invent a map position or gate when the airport is unknown", () => {
    render(
      <AirportLayoverMap
        layover={{ ...layover, iata: "ZZZ", arriveTerminal: null, departTerminal: null }}
        nextLeg={{ ...nextLeg, from: { ...nextLeg.from, iata: "ZZZ", terminal: null, gate: null } }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /airport map/i }));
    expect(screen.getByText(/will not place it on a map/i)).toBeTruthy();
    expect(screen.getByText(/onward: terminal and gate not on record/i)).toBeTruthy();
  });
});