import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { entryRead, airportCountry, ENTRY_GUIDES } from "@/lib/entryReadiness";
import { EntryReadiness } from "@/components/schedule/EntryReadiness";

// Nationality comes from the traveller's own settings; tests set it directly.
let mockNationality: string | null = null;
vi.mock("@/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    prefs: { entry: { nationality: mockNationality } },
    loading: false,
    update: vi.fn(async () => ({})),
  }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  mockNationality = null;
});

describe("entryRead — what the border expects", () => {
  it("never asks for an arrival card on a domestic follow-on (BKK → USM)", () => {
    const read = entryRead({ fromIata: "BKK", toIata: "USM", intent: null, nationality: null });
    expect(read.kind).toBe("domestic");
  });

  it("asks intent first on an international landing (TPE → BKK)", () => {
    const read = entryRead({ fromIata: "TPE", toIata: "BKK", intent: null, nationality: null });
    expect(read.kind).toBe("needs_intent");
  });

  it("owes no card when only changing planes airside", () => {
    const read = entryRead({ fromIata: "TPE", toIata: "BKK", intent: "transit", nationality: null });
    expect(read.kind).toBe("not_needed_transit");
  });

  it("asks the passport country before deciding, and never a number", () => {
    const read = entryRead({ fromIata: "TPE", toIata: "BKK", intent: "enter", nationality: null });
    expect(read.kind).toBe("needs_nationality");
  });

  it("says the TDAC is owed by a non-Thai national entering Thailand", () => {
    const read = entryRead({ fromIata: "TPE", toIata: "BKK", intent: "enter", nationality: "United States" });
    expect(read.kind).toBe("needed");
    if (read.kind === "needed") {
      expect(read.guide.officialUrl).toBe("https://tdac.immigration.go.th");
      expect(read.guide.free).toBe(true);
      expect(read.guide.scamWords).toMatch(/costs nothing/i);
      expect(read.guide.visaWords).toMatch(/not a visa/i);
      expect(read.guide.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("owes no card to a Thai national entering Thailand", () => {
    const read = entryRead({ fromIata: "TPE", toIata: "BKK", intent: "enter", nationality: "thai" });
    expect(read.kind).toBe("not_needed_national");
  });

  it("points at the official immigration site for countries with no vetted notes", () => {
    const read = entryRead({ fromIata: "TPE", toIata: "SIN", intent: "enter", nationality: "United States" });
    expect(read.kind).toBe("no_guide");
  });

  it("stays silent when it cannot tell the countries apart", () => {
    expect(entryRead({ fromIata: "ZZZ", toIata: "QQQ" }).kind).toBe("unknown_route");
  });

  it("keeps the kept airport-country map honest", () => {
    expect(airportCountry("BKK")).toBe("TH");
    expect(airportCountry("USM")).toBe("TH");
    expect(airportCountry("TPE")).toBe("TW");
    expect(airportCountry("ZZZ")).toBeNull();
  });
});

describe("EntryReadiness card", () => {
  it("shows nothing for a domestic leg", () => {
    const { container } = render(<EntryReadiness planId="p1" fromIata="BKK" toIata="USM" />);
    expect(container.firstChild).toBeNull();
  });

  it("asks entering vs changing planes on an international landing", () => {
    render(<EntryReadiness planId="p2" fromIata="TPE" toIata="BKK" />);
    expect(screen.getByRole("button", { name: /I'm entering/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Only changing planes/i })).toBeTruthy();
  });

  it("shows the free official TDAC link and the imitation warning once known", () => {
    mockNationality = "United States";
    render(<EntryReadiness planId="p3" fromIata="TPE" toIata="BKK" />);
    fireEvent.click(screen.getByRole("button", { name: /I'm entering/i }));
    const link = screen.getByRole("link", { name: /official Thailand arrival card/i });
    expect(link.getAttribute("href")).toBe(ENTRY_GUIDES.TH.officialUrl);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(screen.getByText(/costs nothing/i)).toBeTruthy();
    expect(screen.getByText(/not a visa/i)).toBeTruthy();
  });

  it("answers honestly when the passport country is not known", () => {
    render(<EntryReadiness planId="p4" fromIata="TPE" toIata="BKK" />);
    fireEvent.click(screen.getByRole("button", { name: /I'm entering/i }));
    expect(screen.getByLabelText(/Country of your passport/i)).toBeTruthy();
    expect(screen.queryByText(/passport number/i)).toBeNull();
  });
});
