import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ArrivalStamp } from "@/components/schedule/ArrivalStamp";

describe("ArrivalGroundPack", () => {
  it("shows Taipei money, transit and emergency numbers on the face of the card", () => {
    render(<ArrivalStamp iata="TPE" at="2026-09-20T05:10:00" arrived={false} />);
    expect(screen.getByLabelText("NT$ TWD")).toBeTruthy();
    expect(screen.getByText(/Airport MRT signs/)).toBeTruthy();
    expect(screen.getByLabelText("110 · 119")).toBeTruthy();
  });

  it("opens the offline ground pack with phrases, routes, money and numbers", () => {
    render(<ArrivalStamp iata="TPE" at="2026-09-20T05:10:00" arrived={false} />);
    fireEvent.click(screen.getByRole("button", { name: /For when you land in Taipei/ }));
    expect(screen.getByText(/nǐ hǎo/)).toBeTruthy();
    expect(screen.getAllByText(/EasyCard/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Purple Express/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0800-024-111/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Sockets A, B/)).toBeTruthy();
  });

  it("states missing destination facts without guessing", () => {
    render(<ArrivalStamp iata="ZZZ" at={null} arrived={false} />);
    expect(screen.getByText("Echo does not have the currency for ZZZ on record.")).toBeTruthy();
    expect(screen.getByText(/No verified airport-to-city shortcut/)).toBeTruthy();
  });

  it("says plainly when nothing is kept about the place", () => {
    render(<ArrivalStamp iata="ZZZ" at={null} arrived={false} />);
    fireEvent.click(screen.getByRole("button", { name: /Nothing kept about ZZZ yet/ }));
    expect(screen.getByText(/no kept notes/)).toBeTruthy();
  });
});
