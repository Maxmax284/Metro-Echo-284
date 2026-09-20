import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  entryRead,
  entryWindow,
  airportCountry,
  guideStale,
  ENTRY_GUIDES,
  ENTRY_FIXES,
  STREET_KNOWLEDGE,
  MAX_WINDOW_DAYS,
} from "@/lib/entryReadiness";
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

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useScope", () => ({
  useScope: () => ({ withScope: (row: Record<string, unknown>) => row }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: async () => ({ error: null }) }) },
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
    const read = entryRead({ fromIata: "TPE", toIata: "KUL", intent: "enter", nationality: "United States" });
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

describe("entry readiness earlier in the trip, and once per entry", () => {
  it("asks before departure, not only after landing", () => {
    render(<EntryReadiness planId="p5" fromIata="TPE" toIata="BKK" when="before" />);
    expect(screen.getByText(/This flight lands in Thailand/i)).toBeTruthy();
    expect(screen.queryByText(/You landed in Thailand/i)).toBeNull();
  });

  it("still says landed when the leg is on the ground", () => {
    render(<EntryReadiness planId="p6" fromIata="TPE" toIata="BKK" when="after" />);
    expect(screen.getByText(/You landed in Thailand/i)).toBeTruthy();
  });

  it("treats a domestic hop as the same entry once the card is filed", () => {
    const read = entryRead({ fromIata: "BKK", toIata: "USM", filedFor: "TH" });
    expect(read.kind).toBe("already_filed");
  });

  it("does not ask for a second card on the domestic hop after filing", () => {
    window.localStorage.setItem("echo.entry.ack.c.TH", `TH:${ENTRY_GUIDES.TH.checkedOn}`);
    render(<EntryReadiness planId="p7" fromIata="BKK" toIata="USM" />);
    expect(screen.getByText(/not a new entry/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /official Thailand arrival card/i })).toBeNull();
  });

  it("carries one acknowledgment across the legs of a single entry", () => {
    mockNationality = "United States";
    window.localStorage.setItem("echo.entry.intent.p8", "enter");
    window.localStorage.setItem("echo.entry.ack.c.TH", `TH:${ENTRY_GUIDES.TH.checkedOn}`);
    render(<EntryReadiness planId="p8" fromIata="TPE" toIata="BKK" />);
    expect(screen.getByText(/marked done/i)).toBeTruthy();
  });

  it("says out loud when its vetted words have gone stale", () => {
    expect(guideStale(ENTRY_GUIDES.TH, new Date(`${ENTRY_GUIDES.TH.checkedOn}T00:00:00Z`))).toBe(false);
    expect(guideStale(ENTRY_GUIDES.TH, new Date("2030-01-01T00:00:00Z"))).toBe(true);
  });
});

describe("the three-country registry and its official windows", () => {
  it("keeps only vetted countries, each free with an official address and a checked date", () => {
    expect(Object.keys(ENTRY_GUIDES).sort()).toEqual(["SG", "TH", "TW"]);
    for (const guide of Object.values(ENTRY_GUIDES)) {
      expect(guide.free).toBe(true);
      expect(guide.officialUrl).toMatch(/^https:\/\//);
      expect(guide.officialUrl).toMatch(/\.(go\.th|gov\.tw|gov\.sg)/);
      expect(guide.checkedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(guide.sources.length).toBeGreaterThan(0);
      expect(guide.prepWords.length).toBeGreaterThan(0);
      expect(guide.visaWords).toMatch(/not a visa/i);
    }
  });

  it("carries each government's own filing window", () => {
    expect(ENTRY_GUIDES.TH.opensDaysBefore).toBe(2); // 3 days including arrival day
    expect(ENTRY_GUIDES.SG.opensDaysBefore).toBe(2); // 3 days including arrival day
    expect(ENTRY_GUIDES.TW.opensDaysBefore).toBe(7); // widened to 7 days, Jul 2026
    expect(MAX_WINDOW_DAYS).toBe(7);
  });

  it("calls kiosks a last resort, never a boarding plan", () => {
    expect(ENTRY_GUIDES.TH.kioskWords).toMatch(/last resort/i);
    expect(ENTRY_GUIDES.TH.kioskWords).toMatch(/not help/i);
  });

  it("says the window is open once inside it, and too early before", () => {
    const lands = "2026-10-10T06:00:00Z";
    expect(entryWindow({ guide: ENTRY_GUIDES.TH, arriveAt: lands, now: new Date("2026-10-09T00:00:00Z") }).kind).toBe("open");
    expect(entryWindow({ guide: ENTRY_GUIDES.TH, arriveAt: lands, now: new Date("2026-10-01T00:00:00Z") }).kind).toBe("early");
    expect(entryWindow({ guide: ENTRY_GUIDES.TW, arriveAt: lands, now: new Date("2026-10-05T00:00:00Z") }).kind).toBe("open");
  });

  it("dates nothing when no arrival time is on record", () => {
    expect(entryWindow({ guide: ENTRY_GUIDES.TH, arriveAt: null }).kind).toBe("unknown");
  });

  it("owes the Taiwan card on entry and nothing on an airside transfer", () => {
    expect(entryRead({ fromIata: "IAD", toIata: "TPE", intent: "enter", nationality: "United States" }).kind).toBe("needed");
    expect(entryRead({ fromIata: "IAD", toIata: "TPE", intent: "transit" }).kind).toBe("not_needed_transit");
  });

  it("owes the Singapore card on entry but not to a Singaporean passport", () => {
    expect(entryRead({ fromIata: "BKK", toIata: "SIN", intent: "enter", nationality: "Canada" }).kind).toBe("needed");
    expect(entryRead({ fromIata: "BKK", toIata: "SIN", intent: "enter", nationality: "singaporean" }).kind).toBe(
      "not_needed_national",
    );
  });

  it("never repeats Thailand for the BKK → USM domestic hop", () => {
    expect(entryRead({ fromIata: "BKK", toIata: "USM", filedFor: "TH" }).kind).toBe("already_filed");
    expect(entryRead({ fromIata: "BKK", toIata: "USM" }).kind).toBe("domestic");
  });

  it("offers the disabled-field help as steps, never as a diagnosis", () => {
    const fix = ENTRY_FIXES.find((f) => /greyed out/i.test(f.problem));
    expect(fix).toBeTruthy();
    expect(fix!.steps[0]).toMatch(/not knowable/i);
    expect(fix!.steps.join(" ")).toMatch(/screenshot/i);
    expect(fix!.steps.join(" ")).toMatch(/never put in something false/i);
  });

  it("warns about wrong dates and paid imitations in the field notes", () => {
    const all = STREET_KNOWLEDGE.join(" ");
    expect(all).toMatch(/date line/i);
    expect(all).toMatch(/free/i);
    expect(all).toMatch(/offline/i);
  });

  it("keeps a marked-done card as the traveller's own word, offline", () => {
    mockNationality = "United States";
    window.localStorage.setItem("echo.entry.intent.p9", "enter");
    window.localStorage.setItem("echo.entry.ack.c.TH", `TH:${ENTRY_GUIDES.TH.checkedOn}`);
    render(<EntryReadiness planId="p9" fromIata="TPE" toIata="BKK" />);
    expect(screen.getByText(/not verified with Thailand/i)).toBeTruthy();
  });

  it("says the window is open on an upcoming leg inside it", () => {
    mockNationality = "United States";
    const lands = new Date(Date.now() + 36 * 3_600_000).toISOString();
    window.localStorage.setItem("echo.entry.intent.p10", "enter");
    render(<EntryReadiness planId="p10" fromIata="TPE" toIata="BKK" when="before" arriveAt={lands} />);
    expect(screen.getByText(/arrival declaration window is open/i)).toBeTruthy();
  });

  it("says too early when the government's system is not open yet", () => {
    mockNationality = "United States";
    const lands = new Date(Date.now() + 20 * 86_400_000).toISOString();
    window.localStorage.setItem("echo.entry.intent.p11", "enter");
    render(<EntryReadiness planId="p11" fromIata="TPE" toIata="BKK" when="before" arriveAt={lands} />);
    expect(screen.getByText(/Too early for the official system/i)).toBeTruthy();
  });
});
