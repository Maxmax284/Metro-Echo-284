// The gate-mode card as a traveller reads it at 384px: boarding time, gate, seat
// and zone first, the schedule behind them, and no invented boarding time.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GatePass } from "@/components/schedule/GatePass";
import type { FlightPlan } from "@/lib/flightPlan";
import type { LocalTransferVerification } from "@/lib/transferVerification";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
vi.mock("@/lib/vantaVoice", () => ({
  vantaToast: { success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

const PASS: LocalTransferVerification = {
  gate: "A2",
  boarding_time: "15:15",
  seat: "7F",
  zone: "3",
  baggage_status: "unknown",
  transfer_route: "unknown",
  source: "boarding_pass",
  verified_at: "2026-09-20T07:00:00.000Z",
};

const plan = (local: LocalTransferVerification | null): FlightPlan =>
  ({
    id: "pg165",
    origin: "BKK",
    destination: "USM",
    depart_on: "2026-09-20",
    return_on: null,
    passengers: 1,
    currency: "THB",
    source: "manual",
    options: [{ id: "o1", flight_no: "PG165", depart_at: "2026-09-20T15:55:00+07:00" }],
    chosen_option_id: "o1",
    status: "confirmed",
    event_ids: [],
    noticed_from: local ? { source: "local", source_words: "you", local_verification: local } : null,
  } as unknown as FlightPlan);

const hhmm = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(11, 16);

const view = (local: LocalTransferVerification | null) =>
  render(
    <GatePass
      plan={plan(local)}
      flightLabel="PG165"
      providerGate={null}
      departAt="2026-09-20T15:55:00+07:00"
      departLocal="3:55 PM"
      arriveLocal="5:10 PM"
      fmt={hhmm}
      online
      onSave={vi.fn()}
    />,
  );

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-20T07:33:00.000Z"));
});

describe("gate mode card", () => {
  it("puts the printed boarding time, gate, seat and zone up front", () => {
    view(PASS);
    expect(screen.getByLabelText("Gate mode")).toBeTruthy();
    expect(screen.getAllByText(/Boarding$/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Gate")).toBeTruthy();
    expect(screen.getByText("Seat")).toBeTruthy();
    expect(screen.getByText("Zone")).toBeTruthy();
    /* The pass values, character cells and all. */
    const text = document.body.textContent ?? "";
    expect(text).toContain("A2");
    expect(text).toContain("15:15");
    expect(text).toContain("7F");
  });

  it("keeps the schedule second and labelled as the airline's", () => {
    view(PASS);
    expect(screen.getByText(/Departs 3:55 PM/)).toBeTruthy();
    expect(screen.getByText(/airline schedule, local at each airport/)).toBeTruthy();
  });

  it("names where the boarding time came from and counts down to it", () => {
    view(PASS);
    expect(screen.getByText(/Boarding pass · your word · boarding in 42 min/)).toBeTruthy();
  });

  it("offers a labelled window instead of a boarding time when none is on record", () => {
    view(null);
    expect(screen.getByText(/Boarding \(approx window\)/)).toBeTruthy();
    expect(screen.getByText(/planning window, not a boarding time/)).toBeTruthy();
    expect(screen.getByText(/Not on record — check the board/)).toBeTruthy();
  });

  it("shows a gate disagreement and sends the traveller to the display or staff", () => {
    render(
      <GatePass
        plan={plan(PASS)}
        flightLabel="PG165"
        providerGate="B1"
        departAt="2026-09-20T15:55:00+07:00"
        departLocal="3:55 PM"
        arriveLocal="5:10 PM"
        fmt={hhmm}
        online
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText(/live airport display or ask the gate staff/)).toBeTruthy();
  });

  it("offers both ways in, and says the photo is not kept", () => {
    view(null);
    expect(screen.getByText("Type your pass details")).toBeTruthy();
    expect(screen.getByText("Read a photo of it")).toBeTruthy();
    expect(screen.getByLabelText("Photo of your boarding pass")).toBeTruthy();
  });

  it("does not offer a photo read with no signal", () => {
    render(
      <GatePass
        plan={plan(null)}
        flightLabel="PG165"
        providerGate={null}
        departAt="2026-09-20T15:55:00+07:00"
        departLocal="3:55 PM"
        arriveLocal="5:10 PM"
        fmt={hhmm}
        online={false}
        onSave={vi.fn()}
      />,
    );
    expect(screen.getByText("No signal to read a photo")).toBeTruthy();
  });
});
