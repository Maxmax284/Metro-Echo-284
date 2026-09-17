import { describe, expect, it } from "vitest";

// Removing a flight card is a deliberate yes with a receipt. It must never read
// as cancelling a ticket, and it must never claim the board entries a confirmed
// flight already wrote have gone with it.
import { dropConfirmWords, droppedWords, readFlightAsk } from "../../supabase/functions/_shared/flightChat";

describe("asking to remove a flight", () => {
  it("reads a cancel line as a removal ask, not a filing", () => {
    expect(readFlightAsk("cancel flight TG601", "2026-09-17")).toEqual({ kind: "cancel", flight_no: "TG601" });
    expect(readFlightAsk("remove TG601", "2026-09-17")).toEqual({ kind: "cancel", flight_no: "TG601" });
  });

  it("still files a flight with a day", () => {
    expect(readFlightAsk("TG601 friday", "2026-09-17")).toMatchObject({ kind: "file", flight_no: "TG601" });
  });
});

describe("the words before and after removal", () => {
  it("says the entries it wrote come off the board and out of Google", () => {
    const words = dropConfirmWords("TG601", { depart_on: "2026-09-22", status: "confirmed" });
    expect(words).toContain("come off your board");
    expect(words).toContain("Google");
    expect(words).toContain("Nothing is cancelled with the airline");
  });

  it("says a draft was never booked", () => {
    expect(dropConfirmWords("TG601", { depart_on: "2026-09-22", status: "prepared" })).toContain("still a draft");
    expect(droppedWords("TG601", { depart_on: "2026-09-22", status: "prepared" })).toContain(
      "nothing was cancelled with the airline",
    );
  });

  it("counts what it actually cleared, board and Google", () => {
    const words = droppedWords("TG601", { depart_on: "2026-09-22", status: "confirmed" }, {
      entries: 2,
      google_removed: 2,
      google_failed: 0,
    });
    expect(words).toContain("2 board entries removed");
    expect(words).toContain("2 cleared from Google too");
    expect(words).toContain("Nothing was cancelled with the airline");
  });

  it("says plainly when Google kept a copy", () => {
    const words = droppedWords("TG601", { depart_on: "2026-09-22", status: "confirmed" }, {
      entries: 2,
      google_removed: 1,
      google_failed: 1,
    });
    expect(words).toContain("1 Google could not remove");
  });

  it("claims nothing when a confirmed card had no entries left", () => {
    const words = droppedWords("TG601", { depart_on: "2026-09-22", status: "confirmed" }, {
      entries: 0,
      google_removed: 0,
      google_failed: 0,
    });
    expect(words).toContain("no board entries left to clear");
  });
});
