import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrivalStamp } from "@/components/schedule/ArrivalStamp";

describe("ArrivalStamp", () => {
  it("stamps the arrival with clock, money and number", () => {
    render(<ArrivalStamp iata="TPE" at="2026-09-19T21:10:00Z" homeZone="America/New_York" />);
    expect(screen.getByText(/Arrived/)).toBeTruthy();
    expect(screen.getByText(/TPE · Taipei/)).toBeTruthy();
    expect(screen.getByLabelText("5:10 AM")).toBeTruthy();
    expect(screen.getByLabelText("NT$ TWD")).toBeTruthy();
    expect(screen.getByLabelText("110 · 119")).toBeTruthy();
    expect(screen.getByText(/12 hours ahead/)).toBeTruthy();
  });
});
