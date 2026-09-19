import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransferSteps } from "@/components/schedule/TransferSteps";
import { JourneyFitCard } from "@/components/schedule/JourneyFitCard";
import { airportHelp, NO_HELP_PAGE } from "@/lib/airportHelp";
import type { FlightPlan } from "@/lib/flightPlan";

const plan = (over: Partial<FlightPlan> = {}): FlightPlan => ({
  id: "tg637", origin: "TPE", destination: "BKK", depart_on: "2026-09-20", return_on: null,
  passengers: 1, currency: null, source: "entered", chosen_option_id: "tg637-o", status: "confirmed",
  event_ids: [], ownership: "mine", noticed_from: null,
  options: [{ id: "tg637-o", airline: "Thai", flight_no: "TG637", depart_at: null, arrive_at: null, price: null, currency: null, stops: null, note: null }],
  ...over,
});

describe("landed transfer checklist", () => {
  it("keeps only real airport help pages, and says so when there is none", () => {
    expect(airportHelp("TPE")?.url).toMatch(/^https:\/\/www\.taoyuan-airport\.com/);
    expect(airportHelp("BKK")?.url).toMatch(/^https:\/\/suvarnabhumi\.airportthai\.co\.th/);
    expect(airportHelp("ZZZ")).toBeNull();
    expect(airportHelp("")).toBeNull();
  });

  it("shows the TPE help link and the unknown facts to check", () => {
    render(<TransferSteps airport="TPE" onward={plan()} confirmed providerGate={null} />);
    const link = screen.getByRole("link", { name: /Taoyuan departures and transfer help/i });
    expect(link.getAttribute("href")).toBe(airportHelp("TPE")!.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/Check the official board or airline staff/)).toBeTruthy();
    expect(screen.getByText(/do not assume baggage claim/i)).toBeTruthy();
  });

  it("falls back honestly for an airport with no kept page", () => {
    render(<TransferSteps airport="RMQ" onward={plan({ origin: "RMQ" })} confirmed={false} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(NO_HELP_PAGE)).toBeTruthy();
    expect(screen.getByText(/Still a proposal/)).toBeTruthy();
  });

  it("carries a locally verified gate with its source", () => {
    render(
      <TransferSteps
        airport="TPE"
        confirmed
        providerGate="C6"
        onward={plan({ noticed_from: { local_verification: { gate: "D4", boarding_time: "07:15", baggage_status: "through_checked", transfer_route: "airside_transfer", source: "airline_staff", verified_at: "2026-09-20T06:00:00Z" } } as FlightPlan["noticed_from"] })}
      />,
    );
    expect(screen.getByText(/Local gate and provider gate disagree/)).toBeTruthy();
    expect(screen.getByText(/Recorded as checked through/)).toBeTruthy();
    expect(screen.getByText(/Airside transfer locally verified/)).toBeTruthy();
  });

  it("renders the steps inside the candidate card when passed", () => {
    render(
      <JourneyFitCard
        fit={{ kind: "needs_time", plan_id: "tg637", lead: "Possible connection", detail: [] } as never}
        steps={<TransferSteps airport="TPE" onward={plan({ status: "prepared" })} confirmed={false} />}
      />,
    );
    expect(screen.getByText("Transfer steps here")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Taoyuan/i })).toBeTruthy();
    expect(screen.getByText(/Still a proposal/)).toBeTruthy();
  });
});
