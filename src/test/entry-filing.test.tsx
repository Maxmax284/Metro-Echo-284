// A filing is not a yes or a no. These tests hold Echo to the four honest
// states, the "known before is not confirmed now" line, the resident-tenant
// wording, and the refusal to resolve two answers on the traveller's behalf.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accommodationWords,
  addFilingMark,
  filingConflict,
  filingHandled,
  filingLabel,
  filingLatest,
  filingWords,
  parseFilingMarks,
  serializeFilingMarks,
  ENTRY_FIXES,
  ENTRY_GUIDES,
  KNOWN_BEFORE_WORDS,
  FILING_CHOICES,
} from "@/lib/entryReadiness";
import { EntryReadiness } from "@/components/schedule/EntryReadiness";

let mockNationality: string | null = null;
let mockStay: "visiting" | "resident_lease" | null = null;
const update = vi.fn(async () => ({}));
vi.mock("@/hooks/useUserPreferences", () => ({
  useUserPreferences: () => ({
    prefs: { entry: { nationality: mockNationality, stay: mockStay ?? undefined } },
    loading: false,
    update,
  }),
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/useScope", () => ({
  useScope: () => ({ withScope: (row: Record<string, unknown>) => row }),
}));
const insert = vi.fn(async (_row?: unknown) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert }) },
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  mockNationality = null;
  mockStay = null;
  insert.mockClear();
  update.mockClear();
});

describe("filing states", () => {
  it("offers blocked, submitted and officer-resolved — not a switch", () => {
    expect(FILING_CHOICES.map((c) => c.state)).toEqual(["blocked", "submitted", "officer_resolved"]);
  });

  it("never reads a submission as admission", () => {
    expect(filingWords("submitted")).toMatch(/not admission/i);
    expect(filingWords("submitted")).toMatch(/officer/i);
  });

  it("keeps an officer resolution as the traveller's word, not a government record", () => {
    expect(filingWords("officer_resolved")).toMatch(/your word/i);
  });

  it("treats blocked as not started for the purpose of owing the card", () => {
    expect(filingHandled("blocked")).toBe(false);
    expect(filingHandled("not_started")).toBe(false);
    expect(filingHandled("submitted")).toBe(true);
    expect(filingHandled("officer_resolved")).toBe(true);
  });

  it("reads an older build's acknowledgment as a submission", () => {
    const marks = parseFilingMarks("TH:2026-09-20");
    expect(marks).toHaveLength(1);
    expect(marks[0].state).toBe("submitted");
  });

  it("round-trips its own record and ignores nonsense", () => {
    const marks = addFilingMark([], "blocked", "2026-09-20T01:00:00.000Z");
    const back = parseFilingMarks(serializeFilingMarks(marks));
    expect(back).toEqual(marks);
    expect(parseFilingMarks("{oops")).toEqual([]);
    expect(parseFilingMarks(null)).toEqual([]);
  });

  it("does not record the same word twice in a row", () => {
    const once = addFilingMark([], "submitted", "2026-09-20T01:00:00.000Z");
    expect(addFilingMark(once, "submitted", "2026-09-20T02:00:00.000Z")).toBe(once);
  });

  it("shows two answers rather than picking one", () => {
    let marks = addFilingMark([], "blocked", "2026-09-20T01:00:00.000Z");
    expect(filingConflict(marks)).toBeNull();
    marks = addFilingMark(marks, "submitted", "2026-09-20T02:00:00.000Z");
    marks = addFilingMark(marks, "officer_resolved", "2026-09-20T03:30:00.000Z");
    const conflict = filingConflict(marks);
    expect(conflict).toHaveLength(3);
    expect(filingLatest(marks)!.state).toBe("officer_resolved");
    expect(filingLabel("blocked")).toMatch(/blocked/i);
  });
});

describe("known before is not confirmed now", () => {
  it("says an earlier record is not this declaration, and asks for no address", () => {
    expect(KNOWN_BEFORE_WORDS).toMatch(/not this declaration/i);
    expect(KNOWN_BEFORE_WORDS).toMatch(/does not ask for it/i);
  });

  it("words accommodation for a tenant differently from a visitor, with no paperwork", () => {
    expect(accommodationWords("visiting")).toMatch(/first night/i);
    expect(accommodationWords(null)).toMatch(/first night/i);
    const resident = accommodationWords("resident_lease");
    expect(resident).toMatch(/tenancy/i);
    expect(resident).toMatch(/no paperwork/i);
  });

  it("has steps for the form that greys out accommodation and submits anyway", () => {
    const fix = ENTRY_FIXES.find((f) => /greyed out and it submitted/i.test(f.problem));
    expect(fix).toBeTruthy();
    const all = fix!.steps.join(" ");
    expect(all).toMatch(/not the same as the declaration being complete/i);
    expect(all).toMatch(/assistance/i);
    expect(all).not.toMatch(/because the site/i);
  });
});

describe("the border card, live", () => {
  const openCard = (planId: string) => {
    mockNationality = "United States";
    window.localStorage.setItem(`echo.entry.intent.${planId}`, "enter");
    render(<EntryReadiness planId={planId} fromIata="TPE" toIata="BKK" />);
  };

  it("asks where you got to instead of a single filed switch", () => {
    openCard("f1");
    expect(screen.getByText(/Where you got to/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /The form blocked me/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /I've filed it/i })).toBeNull();
  });

  it("keeps the card open when the form blocked you, and says nothing is filed", () => {
    openCard("f2");
    fireEvent.click(screen.getByRole("button", { name: /The form blocked me/i }));
    expect(screen.getByText(/nothing is filed/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /official Thailand arrival card/i })).toBeTruthy();
  });

  it("writes one plain receipt attributed to the person, with no address in it", () => {
    openCard("f3");
    fireEvent.click(screen.getByRole("button", { name: /site took it/i }));
    expect(insert).toHaveBeenCalledTimes(1);
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row.event).toBe("entry.filing_state_said_by_person");
    expect(Object.keys(row.payload as object).sort()).toEqual(["at", "country_code", "state"]);
  });

  it("shows both answers once the form blocked you and an officer sorted it", () => {
    openCard("f4");
    fireEvent.click(screen.getByRole("button", { name: /The form blocked me/i }));
    fireEvent.click(screen.getByRole("button", { name: /officer sorted it/i }));
    expect(screen.getByText(/Two answers on record/i)).toBeTruthy();
    expect(screen.getByText(/picks neither/i)).toBeTruthy();
  });

  it("offers the tenant wording without asking for a lease or an address", () => {
    mockStay = "resident_lease";
    openCard("f5");
    expect(screen.getByText(/as it stands on your tenancy/i)).toBeTruthy();
    expect(screen.queryByLabelText(/address/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /I live here, on a lease/i }));
    expect(update).toHaveBeenCalled();
  });

  it("stays quiet on the domestic hop once the entry is submitted", () => {
    window.localStorage.setItem(
      `echo.entry.ack.c.TH`,
      serializeFilingMarks([{ state: "submitted", at: "2026-09-20T01:00:00.000Z" }]),
    );
    render(<EntryReadiness planId="f6" fromIata="BKK" toIata="USM" />);
    expect(screen.getByText(/not a new entry/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /The form blocked me/i })).toBeNull();
    expect(ENTRY_GUIDES.TH.country).toBe("Thailand");
  });
});
