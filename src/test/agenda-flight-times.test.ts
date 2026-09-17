import { describe, expect, it } from "vitest";
import { applyLiveFlightTimes, liveMarkerWords } from "@/lib/agendaFlightTimes";
import { buildAgendaTimeline, type BoardEntry } from "@/lib/agendaBoard";

const depart: BoardEntry = {
  id: "ev-dep",
  title: "Depart Hong Kong → Bangkok · TG601",
  starts_at: "2026-09-18T04:55:00.000Z",
  ends_at: "2026-09-18T07:45:00.000Z",
  all_day: false,
  location: "Hong Kong",
};
const land: BoardEntry = {
  id: "ev-arr",
  title: "Land Bangkok · TG601",
  starts_at: "2026-09-18T07:45:00.000Z",
  ends_at: null,
  all_day: false,
  location: "Bangkok",
};

function plan(live: unknown) {
  return { event_ids: ["ev-dep", "ev-arr"], live_status: live, live_checked_at: "2026-09-18T03:00:00.000Z" };
}

describe("live flight times on the day rail", () => {
  it("moves both halves to the hours the airline is keeping", () => {
    const [dep, arr] = applyLiveFlightTimes([depart, land], [
      plan({
        status: "active",
        departure: { estimated: "2026-09-18T05:35:00.000Z", gate: "12" },
        arrival: { estimated: "2026-09-18T08:20:00.000Z" },
      }),
    ]);
    expect(dep.starts_at).toBe("2026-09-18T05:35:00.000Z");
    expect(dep.ends_at).toBe("2026-09-18T08:20:00.000Z");
    expect(dep.live?.movedMinutes).toBe(40);
    expect(dep.live?.gate).toBe("12");
    expect(arr.starts_at).toBe("2026-09-18T08:20:00.000Z");
    expect(arr.live?.movedMinutes).toBe(35);
  });

  it("keeps the filed hours when the provider carried no estimate or actual", () => {
    const [dep] = applyLiveFlightTimes([depart], [
      plan({ status: "scheduled", departure: { scheduled: "2026-09-18T04:55:00.000Z" }, arrival: {} }),
    ]);
    expect(dep.starts_at).toBe(depart.starts_at);
    expect(dep.live?.movedMinutes).toBeNull();
    expect(liveMarkerWords(dep.live)).toBe("scheduled");
  });

  it("does not invent a new departure for a cancelled flight", () => {
    const [dep] = applyLiveFlightTimes([depart], [
      plan({ status: "cancelled", departure: { estimated: "2026-09-18T06:00:00.000Z" }, arrival: {} }),
    ]);
    expect(dep.starts_at).toBe(depart.starts_at);
    expect(dep.live?.status).toBe("cancelled");
    expect(liveMarkerWords(dep.live)).toBe("cancelled");
  });

  it("leaves entries no flight owns untouched and unlabelled", () => {
    const other: BoardEntry = { ...depart, id: "ev-other", title: "Dentist" };
    const [row] = applyLiveFlightTimes([other], [plan({ status: "active", departure: { estimated: "2026-09-18T06:00:00.000Z" }, arrival: {} })]);
    expect(row.live).toBeUndefined();
    expect(row.starts_at).toBe(other.starts_at);
  });

  it("carries the reading onto the rail marker", () => {
    const rows = applyLiveFlightTimes([depart], [
      plan({ status: "active", departure: { estimated: "2026-09-18T05:35:00.000Z", terminal: "1" }, arrival: {} }),
    ]);
    const timeline = buildAgendaTimeline(rows, "2026-09-18", "UTC", new Date("2026-09-18T04:00:00.000Z"));
    expect(timeline?.markers[0].startMinute).toBe(5 * 60 + 35);
    expect(liveMarkerWords(timeline?.markers[0].live)).toBe("40 min later · terminal 1");
  });
});
