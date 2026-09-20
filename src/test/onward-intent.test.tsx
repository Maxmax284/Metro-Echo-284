import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnwardIntent, readOnwardHop, writeOnwardHop } from "@/components/schedule/OnwardIntent";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("OnwardIntent — the next hop without inventing a flight", () => {
  it("asks for the next airport and invents no flight", () => {
    render(<OnwardIntent landedIata="BKK" />);
    expect(screen.getByLabelText(/Airport code/i)).toBeTruthy();
    expect(screen.getByText(/No flight is invented/i)).toBeTruthy();
    expect(screen.queryByText(/boarding/i)).toBeNull();
  });

  it("holds the hop with no times, no number and no countdown", () => {
    render(<OnwardIntent landedIata="BKK" />);
    fireEvent.change(screen.getByLabelText(/Airport code/i), { target: { value: "usm" } });
    fireEvent.click(screen.getByRole("button", { name: /Keep it on my desk/i }));
    expect(screen.getByText("USM")).toBeTruthy();
    expect(screen.getByText(/No flight on record for this hop yet/i)).toBeTruthy();
    expect(readOnwardHop()).toMatchObject({ from: "BKK", to: "USM" });
  });

  it("survives a reload from device storage", () => {
    writeOnwardHop({ from: "BKK", to: "USM", at: new Date().toISOString() });
    render(<OnwardIntent landedIata="BKK" />);
    expect(screen.getByText("USM")).toBeTruthy();
  });

  it("offers the ordinary add path only when one exists", () => {
    writeOnwardHop({ from: "BKK", to: "USM", at: new Date().toISOString() });
    const onAdd = vi.fn();
    render(<OnwardIntent landedIata="BKK" onAddFlight={onAdd} />);
    fireEvent.click(screen.getByRole("button", { name: /Add the flight now/i }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("drops the hop on the traveller's word alone", () => {
    writeOnwardHop({ from: "BKK", to: "USM", at: new Date().toISOString() });
    render(<OnwardIntent landedIata="BKK" />);
    fireEvent.click(screen.getByRole("button", { name: /Drop this hop/i }));
    expect(readOnwardHop()).toBeNull();
    expect(screen.getByLabelText(/Airport code/i)).toBeTruthy();
  });

  it("refuses a code that is not three letters", () => {
    render(<OnwardIntent landedIata="BKK" />);
    fireEvent.change(screen.getByLabelText(/Airport code/i), { target: { value: "US" } });
    expect(screen.getByRole("button", { name: /Keep it on my desk/i })).toHaveProperty("disabled", true);
  });
});
