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
  it("says the board entries survive a confirmed removal", () => {
    const words = dropConfirmWords("TG601", { depart_on: "2026-09-22", status: "confirmed" });
    expect(words).toContain("stay on your board");
    expect(words).toContain("Nothing is cancelled with the airline");
  });

  it("says a draft was never booked", () => {
    expect(dropConfirmWords("TG601", { depart_on: "2026-09-22", status: "prepared" })).toContain("still a draft");
    expect(droppedWords("TG601", { depart_on: "2026-09-22", status: "prepared" })).toContain(
      "nothing was cancelled with the airline",
    );
  });

  it("never says a confirmed flight was cancelled with the airline", () => {
    expect(droppedWords("TG601", { depart_on: "2026-09-22", status: "confirmed" })).toContain(
      "board entries it wrote are still there",
    );
  });
});
