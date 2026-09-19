import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrivalStamp } from "@/components/schedule/ArrivalStamp";

describe("ArrivalGroundPack", () => {
  it("shows Taipei money, phrases, transit and emergency numbers", () => {
    render(<ArrivalStamp iata="TPE" at="2026-09-20T05:10:00" arrived={false} />);
    expect(screen.getByLabelText("NT$ TWD")).toBeTruthy();
    expect(screen.getByText(/Airport MRT signs/)).toBeTruthy();
    expect(screen.getByText(/nǐ hǎo/)).toBeTruthy();
    expect(screen.getByLabelText("110 · 119")).toBeTruthy();
  });

  it("states missing destination facts without guessing", () => {
    render(<ArrivalStamp iata="ZZZ" at={null} arrived={false} />);
    expect(screen.getByText("Echo does not have the currency for ZZZ on record.")).toBeTruthy();
    expect(screen.getByText(/No verified airport-to-city shortcut/)).toBeTruthy();
  });
});