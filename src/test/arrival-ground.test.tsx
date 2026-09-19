import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrivalGroundPack } from "@/components/schedule/ArrivalGroundPack";

describe("ArrivalGroundPack", () => {
  it("shows Taipei money, phrases, transit and emergency numbers", () => {
    render(<ArrivalGroundPack iata="TPE" />);
    expect(screen.getByText("NT$ TWD")).toBeTruthy();
    expect(screen.getByText(/Airport MRT signs/)).toBeTruthy();
    expect(screen.getByText(/nǐ hǎo/)).toBeTruthy();
    expect(screen.getByText(/Police 110/)).toBeTruthy();
  });

  it("states missing destination facts without guessing", () => {
    render(<ArrivalGroundPack iata="ZZZ" />);
    expect(screen.getByText("Not on record")).toBeTruthy();
    expect(screen.getByText(/No verified airport-to-city shortcut/)).toBeTruthy();
  });
});