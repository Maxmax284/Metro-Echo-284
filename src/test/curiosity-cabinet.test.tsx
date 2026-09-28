import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CuriosityCabinet } from "@/components/awareness/CuriosityCabinet";

const BKK = { lat: 13.7563, lon: 100.5018, timeZone: "Asia/Bangkok" };

describe("CuriosityCabinet — about-you dials", () => {
  // The sixth slot rotates one dial a day; 2026-01-01 is a travel-dial day,
  // so the board count these tests assert on is the one showing.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  it("teaches when no home is pinned and no places are kept", () => {
    render(
      <CuriosityCabinet city="Bangkok" lat={BKK.lat} lon={BKK.lon} timeZone={BKK.timeZone} home={null} counts={null} />,
    );
    expect(screen.getByText("No home pinned")).toBeInTheDocument();
    expect(screen.getByText("No places yet")).toBeInTheDocument();
  });

  it("shows the home hour from home's own zone, and the board count", () => {
    render(
      <CuriosityCabinet
        city="Bangkok"
        lat={BKK.lat}
        lon={BKK.lon}
        timeZone={BKK.timeZone}
        home={{ label: "Fairfax", timeZone: "America/New_York" }}
        counts={{ places: 5, countries: 2 }}
      />,
    );
    expect(screen.getByText("At home")).toBeInTheDocument();
    expect(screen.getByText(/Fairfax/)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2 countries")).toBeInTheDocument();
  });

  it("says you're home when the board reads the home place", () => {
    render(
      <CuriosityCabinet
        city="Fairfax"
        lat={38.86}
        lon={-77.3}
        timeZone="America/New_York"
        home={{ label: "Fairfax", timeZone: "America/New_York", atHome: true }}
        counts={{ places: 5, countries: 2 }}
      />,
    );
    expect(screen.getByText("You're home")).toBeInTheDocument();
  });

  it("admits when home's clock zone isn't on file instead of guessing an hour", () => {
    render(
      <CuriosityCabinet
        city="Bangkok"
        lat={BKK.lat}
        lon={BKK.lon}
        timeZone={BKK.timeZone}
        home={{ label: "Old house", timeZone: null }}
        counts={{ places: 1, countries: 1 }}
      />,
    );
    expect(screen.getByText("its clock zone isn't on file")).toBeInTheDocument();
  });

  it("shows the device's word for the line", () => {
    render(
      <CuriosityCabinet city="Bangkok" lat={BKK.lat} lon={BKK.lon} timeZone={BKK.timeZone} home={null} counts={null} />,
    );
    // jsdom is online with no connection details.
    expect(screen.getByText("Online")).toBeInTheDocument();
  });
});
