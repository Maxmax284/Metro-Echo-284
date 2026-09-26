import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarePlace } from "@/lib/careFinder";

/* The card never talks to the network in these tests — the hook is staged. */
const ROWS: CarePlace[] = [
  { id: "a", name: "Samui Emergency Hospital", kind: "emergency", lat: 9.5, lon: 100, distanceM: 1200, address: "Chaweng", phone: null, hours: null, emergency: true },
  { id: "b", name: "Samui International Hospital", kind: "hospital", lat: 9.5, lon: 100, distanceM: 2400, address: null, phone: "077 999 000", hours: null, emergency: null },
  { id: "c", name: "Lamai Clinic", kind: "clinic", lat: 9.5, lon: 100, distanceM: 800, address: null, phone: null, hours: null, emergency: null },
  { id: "d", name: "Boots Pharmacy", kind: "pharmacy", lat: 9.5, lon: 100, distanceM: 500, address: null, phone: null, hours: null, emergency: null },
];

const careState = {
  places: ROWS,
  radiusM: 5000,
  source: "osm",
  loading: false,
  error: null as string | null,
  hasFix: true,
  country: "Thailand" as string | null,
  placeLabel: "Ko Samui",
  kept: [] as Array<{ id: string; label: string; address: string | null; notes: string | null; lat: number | null; lon: number | null }>,
  look: vi.fn(),
  keep: vi.fn(),
  forget: vi.fn(),
};

vi.mock("@/hooks/useCareNearby", () => ({
  useCareNearby: () => careState,
}));

import { LocalHelpCard } from "@/components/awareness/LocalHelpCard";

describe("local help on the place board", () => {
  beforeEach(() => {
    careState.places = ROWS;
    careState.loading = false;
    careState.error = null;
    careState.hasFix = true;
    careState.kept = [];
  });

  it("names the published numbers for the country on file, and never dials", () => {
    render(<LocalHelpCard country="Thailand" boardLabel="Ko Samui" boardIsLive />);
    expect(screen.getByText("191")).toBeTruthy();
    expect(screen.getByText(/ambulance 1669/)).toBeTruthy();
    expect(screen.getByText(/1155 is the tourist police/)).toBeTruthy();
    expect(screen.getByText(/Echo can't make the call/)).toBeTruthy();
    /* The emergency strip is words, not a tel: link — Echo never dials. */
    expect(screen.queryByRole("link", { name: /191/ })).toBeNull();
  });

  it("says so plainly when the country has no recorded number", () => {
    render(<LocalHelpCard country="Wakanda" boardLabel="Wakanda" boardIsLive />);
    expect(screen.getByText(/no recorded emergency number for Wakanda/)).toBeTruthy();
  });

  it("never guesses a number without a country", () => {
    render(<LocalHelpCard country={null} boardLabel="a saved place" boardIsLive={false} />);
    expect(screen.getByText(/no number it can honestly give/)).toBeTruthy();
  });

  it("never borrows the live care list when the board reads a saved place", () => {
    careState.kept = [{ id: "k1", label: "Bangkok Hospital", address: null, notes: null, lat: null, lon: null }];
    render(<LocalHelpCard country="Thailand" boardLabel="Bangkok" boardIsLive={false} />);
    expect(screen.getByText(/Switch back to your live place/)).toBeTruthy();
    expect(screen.queryByText("Samui Emergency Hospital")).toBeNull();
    /* Kept pins are the person's own record — they show on every board. */
    expect(screen.getByText("Kept for the board")).toBeTruthy();
    expect(screen.getByText("Bangkok Hospital")).toBeTruthy();
  });

  it("leads with the nearest three and opens to the full list with chips", () => {
    render(<LocalHelpCard country="Thailand" boardLabel="Ko Samui" boardIsLive />);
    expect(screen.getByText("Samui Emergency Hospital")).toBeTruthy();
    expect(screen.getByText("Lamai Clinic")).toBeTruthy();
    expect(screen.queryByText("Boots Pharmacy")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /All care nearby/ }));
    expect(screen.getByText("Boots Pharmacy")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pharmacy" })).toBeTruthy();
    expect(screen.getByLabelText("Search care nearby")).toBeTruthy();
  });

  it("teaches how the list fills in when there is no fix", () => {
    careState.hasFix = false;
    careState.places = [];
    render(<LocalHelpCard country="Thailand" boardLabel="Ko Samui" boardIsLive />);
    expect(screen.getByText(/Set\s+where you are and the list fills in/)).toBeTruthy();
    expect(screen.queryByText("Samui Emergency Hospital")).toBeNull();
  });
});
