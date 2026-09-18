import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AirportClock } from "@/components/schedule/AirportClock";

describe("AirportClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-19T05:15:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("reads the departure airport's own clock and states the difference", () => {
    render(<AirportClock iata="TPE" homeZone="America/New_York" />);
    // 05:15 UTC is 1:15 PM in Taipei.
    expect(screen.getByLabelText("1:15 PM")).toBeTruthy();
    expect(screen.getByText(/Taipei/)).toBeTruthy();
    expect(screen.getByText(/12 hours ahead of your home clock/)).toBeTruthy();
    expect(screen.getByText(/keeps your clock until you say switch/)).toBeTruthy();
  });

  it("says it has no clock for an airport it does not keep", () => {
    render(<AirportClock iata="ZZZ" homeZone="America/New_York" />);
    expect(screen.getByText(/not in Echo's airport table/)).toBeTruthy();
  });
});
