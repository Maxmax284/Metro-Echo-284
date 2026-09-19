import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TransferVerification } from "@/components/schedule/TransferVerification";
import { humanizeEvent, kindLabel } from "@/lib/plainLabels";
import { gateProvenance, transferChecklist } from "@/lib/transferVerification";
import type { FlightPlan } from "@/lib/flightPlan";

const plan = (local: FlightPlan["noticed_from"] = null): FlightPlan => ({
  id: "tg637", origin: "TPE", destination: "BKK", depart_on: "2026-09-20", return_on: null,
  passengers: 1, currency: null, source: "entered", chosen_option_id: "tg637-o", status: "confirmed",
  event_ids: [], ownership: "mine", noticed_from: local,
  options: [{ id: "tg637-o", airline: "Thai", flight_no: "TG637", depart_at: null, arrive_at: null, price: null, currency: null, stops: null, note: null }],
});

describe("local transfer verification", () => {
  it("uses clear Receipts wording", () => {
    expect(humanizeEvent("flight.local_transfer_verified")).toBe("Local transfer details recorded");
    expect(kindLabel("flight_plan")).toBe("Flight");
  });
  it("distinguishes candidate and confirmed onward legs", () => {
    expect(transferChecklist({ confirmed: false })[0].detail).toMatch(/proposal/);
    expect(transferChecklist({ confirmed: true })[0].detail).toBe("On your journey");
  });

  it("keeps unknown baggage and route honest", () => {
    const rows = transferChecklist({ confirmed: true });
    expect(rows[2].detail).toMatch(/do not assume baggage claim/i);
    expect(rows[3].detail).toMatch(/confirm the required steps/i);
  });

  it("calls out a local/provider gate conflict", () => {
    const read = gateProvenance("C6", { gate: "D4", source: "departures_board", verified_at: "2026-09-19T22:00:00Z" });
    expect(read.conflict).toBe(true);
    expect(read.value).toBe("D4");
    expect(read.source).toMatch(/traveler-verified locally/);
  });

  it("requires review before recording and states the mutation boundary", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    render(<TransferVerification airport="TPE" onward={plan()} confirmed online providerGate={null} onConfirm={onConfirm} />);
    expect(screen.getByText(/official departures board/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add local details" }));
    fireEvent.change(screen.getByLabelText("Gate (optional)"), { target: { value: "D4" } });
    fireEvent.change(screen.getByLabelText("Checked baggage"), { target: { value: "through_checked" } });
    fireEvent.click(screen.getByRole("button", { name: "Review local details" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/does not book, board, or change/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and record" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ gate: "D4", baggage_status: "through_checked", source: "departures_board" })));
  });

  it("disables recording offline but keeps guidance visible", () => {
    render(<TransferVerification airport="TPE" onward={plan()} confirmed online={false} providerGate={null} onConfirm={vi.fn()} />);
    expect(screen.getByText(/Offline/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add local details" }));
    expect(screen.getByRole("button", { name: "Review local details" })).toBeDisabled();
  });

  it("acknowledges once and reopens when asked", () => {
    render(<TransferVerification airport="TPE" onward={plan()} confirmed online providerGate={null} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    const folded = screen.getByRole("button", { name: /Transfer steps kept/ });
    expect(folded).toBeTruthy();
    fireEvent.click(folded);
    expect(screen.getByText(/official departures board/)).toBeTruthy();
  });

  it("re-surfaces acknowledged guidance when the provider gate changes", async () => {
    const { rerender } = render(<TransferVerification airport="TPE" onward={plan()} confirmed online providerGate="C6" providerCheckedAt="2026-09-19T22:00:00Z" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.getByRole("button", { name: /Transfer steps kept/ })).toBeTruthy();
    rerender(<TransferVerification airport="TPE" onward={plan()} confirmed online providerGate="D4" providerCheckedAt="2026-09-19T22:10:00Z" onConfirm={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/official departures board/)).toBeTruthy());
  });
});