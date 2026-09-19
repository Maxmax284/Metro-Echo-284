import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FlightRouteMap } from "@/components/schedule/FlightRouteMap";
import type { Journey, Leg } from "@/lib/journey";

function leg(from: string, to: string, no: string, order: number): Leg {
  return {
    plan_id: `p${order}`,
    order,
    flight_no: no,
    airline: null,
    from: { iata: from, at: "2026-09-19T05:15:00Z", basis: "scheduled", terminal: null, gate: null },
    to: { iata: to, at: "2026-09-20T09:10:00Z", basis: "scheduled", terminal: null, gate: null },
    live_checked_at: null,
    filed_status: null,
    override: null,
    override_note: null,
  };
}

const journey: Journey = {
  id: "route-test",
  title: "Washington to Bangkok",
  legs: [leg("IAD", "TPE", "BR3", 0), leg("TPE", "BKK", "TG637", 1)],
  segments: [],
};

describe("FlightRouteMap", () => {
  it("keeps unavailable position honest and switches between Globe and Sketch", () => {
    render(
      <FlightRouteMap
        journey={journey}
        activeLegIndex={0}
        confirmedPlanIds={new Set(["p0"])}
        positionSource="clock"
      />,
    );
    expect(screen.getByText(/time-interpolated on the flight strip only/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /globe/i }));
    expect(screen.getByTestId("route-globe")).toBeTruthy();
    expect(screen.queryByLabelText(/airline fix/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /sketch/i }));
    expect(screen.getByRole("img", { name: "Your flight route" })).toBeTruthy();
  });

  it("labels a source-supported aircraft fix", () => {
    render(
      <FlightRouteMap
        journey={journey}
        activeLegIndex={0}
        confirmedPlanIds={new Set(["p0"])}
        positionSource="radar"
        aircraft={{ lat: 48, lon: -120, heading: 290, label: "BR3 · airline fix" }}
      />,
    );
    expect(screen.getByText("BR3 · airline fix · provider live fix.")).toBeTruthy();
  });
});