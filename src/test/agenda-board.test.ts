import { describe, it, expect } from "vitest";
import {
  boardFacts,
  currentStay,
  dedupeBoard,
  durationWords,
  isStay,
  nightsLeft,
  peopleOn,
  peopleWords,
  personLabel,
  roomLabel,
  stayLine,
  type BoardEntry,
} from "@/lib/agendaBoard";

const e = (o: Partial<BoardEntry>): BoardEntry => ({
  id: o.id ?? "1",
  title: o.title ?? "Thing",
  starts_at: o.starts_at ?? "2026-09-16T14:00:00.000Z",
  ends_at: o.ends_at ?? null,
  all_day: o.all_day ?? false,
  location: o.location ?? null,
  ...o,
});

describe("agenda board — one entry per real entry", () => {
  it("collapses the same entry arriving from two calendars", () => {
    const rows = dedupeBoard([
      e({ id: "a", title: "Wingate stay", ends_at: "2026-09-19T14:00:00.000Z" }),
      e({ id: "b", title: "wingate stay ", ends_at: "2026-09-19T14:00:00.000Z" }),
    ]);
    expect(rows).toHaveLength(1);
  });

  it("keeps two genuinely different entries", () => {
    const rows = dedupeBoard([e({ id: "a" }), e({ id: "b", starts_at: "2026-09-16T16:00:00.000Z" })]);
    expect(rows).toHaveLength(2);
  });

  it("prefers the feed's own id over the title", () => {
    const rows = dedupeBoard([
      e({ id: "a", uid: "u1", title: "Standup" }),
      e({ id: "b", uid: "u2", title: "Standup" }),
    ]);
    expect(rows).toHaveLength(2);
  });
});

describe("agenda board — how long", () => {
  it("says minutes under an hour", () => {
    expect(durationWords(e({ ends_at: "2026-09-16T14:45:00.000Z" }))).toBe("45 min");
  });
  it("says hours and minutes", () => {
    expect(durationWords(e({ ends_at: "2026-09-16T15:30:00.000Z" }))).toBe("1h 30m");
  });
  it("says days for a stay", () => {
    expect(durationWords(e({ ends_at: "2026-09-19T14:00:00.000Z" }))).toBe("3 days");
  });
  it("stays blank when the entry never said how long", () => {
    expect(durationWords(e({}))).toBe("");
  });
});

describe("agenda board — a stay is not an appointment", () => {
  it("recognises a multi-day entry as a stay", () => {
    expect(isStay(e({ ends_at: "2026-09-19T14:00:00.000Z" }))).toBe(true);
    expect(isStay(e({ ends_at: "2026-09-16T15:00:00.000Z" }))).toBe(false);
  });

  it("counts the nights left", () => {
    const stay = e({ ends_at: "2026-09-19T14:00:00.000Z" });
    expect(nightsLeft(stay, new Date("2026-09-17T09:00:00.000Z"))).toBe(3);
  });

  it("finds the stay you are inside, once", () => {
    const stay = e({ id: "s", title: "Wingate", ends_at: "2026-09-19T14:00:00.000Z", location: "Wingate, Charlotte" });
    const dup = { ...stay, id: "s2" };
    const found = currentStay([stay, dup], new Date("2026-09-17T09:00:00.000Z"));
    expect(found?.id).toBe("s");
  });

  it("says nothing when no stay is running", () => {
    expect(currentStay([e({ ends_at: "2026-09-16T15:00:00.000Z" })])).toBeNull();
    expect(stayLine(null)).toBe("");
  });

  it("reads the roof line with nights left and where", () => {
    const stay = e({ title: "Wingate", ends_at: "2026-09-19T14:00:00.000Z", location: "Wingate Hotel, Charlotte NC" });
    const line = stayLine(stay, new Date("2026-09-17T09:00:00.000Z"));
    expect(line).toContain("Wingate");
    expect(line).toContain("3 nights left");
  });
});

describe("agenda board — where and who", () => {
  it("reads the room out of an address without mangling it", () => {
    expect(roomLabel(e({ location: "Room 4B, 200 Main St" }))).toBe("Room 4B");
    expect(roomLabel(e({ location: "" }))).toBe("");
  });

  it("takes explicit people first and never invents one", () => {
    expect(peopleOn(e({ attendees: ["dani@example.com"] }))).toEqual(["dani@example.com"]);
    expect(peopleOn(e({ title: "Coffee with Dani" }))).toEqual([]);
  });

  it("falls back to an address written into the description", () => {
    expect(peopleOn(e({ description: "invite from nikki@lamai.co" }))).toEqual(["nikki@lamai.co"]);
  });

  it("says the name a person would say", () => {
    expect(personLabel("dani.wolfe@example.com")).toBe("Dani Wolfe");
    expect(personLabel("Nikki")).toBe("Nikki");
    expect(peopleWords(e({ attendees: ["a@x.co", "b@x.co", "c@x.co"] }))).toBe("A, B +1");
  });

  it("leaves every fact blank that the entry never carried", () => {
    expect(boardFacts(e({}))).toEqual({ duration: "", room: "", people: "" });
  });
});
