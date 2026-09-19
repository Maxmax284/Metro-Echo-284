import { describe, expect, it } from "vitest";
import { normalizeAeroApi, wallAt } from "@/lib/aeroApi";

/** One AeroAPI row shaped like the real payload, trimmed to what Echo reads. */
const tg = {
  ident: "THA637",
  ident_iata: "TG637",
  operator: "THA",
  operator_iata: "TG",
  operator_name: "Thai Airways",
  origin: { code: "RCTP", code_iata: "TPE", name: "Taoyuan Intl", timezone: "Asia/Taipei" },
  destination: { code: "VTBS", code_iata: "BKK", name: "Suvarnabhumi", timezone: "Asia/Bangkok" },
  scheduled_out: "2026-09-19T23:55:00Z", // 07:55 the 20th in Taipei
  estimated_out: null,
  actual_out: null,
  scheduled_in: "2026-09-20T03:35:00Z", // 10:35 the 20th in Bangkok
  gate_origin: "A5",
  terminal_origin: "2",
  departure_delay: 600,
  cancelled: false,
  diverted: false,
};

describe("wallAt", () => {
  it("renders an instant as the clock on the wall where it happens", () => {
    expect(wallAt("2026-09-19T23:55:00Z", "Asia/Taipei")).toBe("2026-09-20T07:55:00");
  });

  it("carries no time at all rather than a time read in the wrong city", () => {
    expect(wallAt("2026-09-19T23:55:00Z", null)).toBeNull();
    expect(wallAt(null, "Asia/Taipei")).toBeNull();
  });
});

describe("normalizeAeroApi", () => {
  it("reads the day on the departure airport's clock, not UTC", () => {
    const live = normalizeAeroApi({ flights: [tg] }, { flight_no: "TG637", flight_date: "2026-09-20" });
    expect(live).not.toBeNull();
    expect(live!.departure.iata).toBe("TPE");
    expect(live!.departure.scheduled).toBe("2026-09-20T07:55:00");
    expect(live!.arrival.iata).toBe("BKK");
    expect(live!.arrival.scheduled).toBe("2026-09-20T10:35:00");
  });

  it("keeps the filed gate, terminal and delay as read", () => {
    const live = normalizeAeroApi({ flights: [tg] }, { flight_no: "TG637", flight_date: "2026-09-20" })!;
    expect(live.departure.gate).toBe("A5");
    expect(live.departure.terminal).toBe("2");
    expect(live.departure.delay_min).toBe(10);
    expect(live.status).toBe("scheduled");
  });

  it("says nothing on record when no row carries the day asked about", () => {
    expect(normalizeAeroApi({ flights: [tg] }, { flight_no: "TG637", flight_date: "2026-09-25" })).toBeNull();
    expect(normalizeAeroApi({ flights: [] }, { flight_no: "TG637", flight_date: "2026-09-20" })).toBeNull();
  });

  it("finds a codeshare filed under the operating number and names both", () => {
    const row = { ...tg, ident_iata: "BR3", codeshares_iata: ["TG6285"], operator_name: "EVA Air", operator_iata: "BR" };
    const live = normalizeAeroApi({ flights: [row] }, { flight_no: "TG6285", flight_date: "2026-09-20" })!;
    expect(live.operated_by?.flight_no).toBe("BR3");
    expect(live.operated_by?.carrier).toBe("EVA Air");
    expect(live.marketed_as?.flight_no).toBe("TG6285");
  });

  it("reports a cancellation as cancelled and a takeoff as in the air", () => {
    const off = normalizeAeroApi(
      { flights: [{ ...tg, actual_out: "2026-09-19T23:58:00Z" }] },
      { flight_no: "TG637", flight_date: "2026-09-20" },
    )!;
    expect(off.status).toBe("active");
    const dead = normalizeAeroApi(
      { flights: [{ ...tg, cancelled: true }] },
      { flight_no: "TG637", flight_date: "2026-09-20" },
    )!;
    expect(dead.status).toBe("cancelled");
  });

  it("carries a fix only when the feed gave real coordinates", () => {
    const none = normalizeAeroApi({ flights: [tg] }, { flight_no: "TG637", flight_date: "2026-09-20" })!;
    expect(none.position).toBeNull();
    const seen = normalizeAeroApi(
      {
        flights: [
          {
            ...tg,
            last_position: { latitude: 25.1, longitude: 121.2, altitude: 350, heading: 200, groundspeed: 480, timestamp: "2026-09-20T01:00:00Z" },
          },
        ],
      },
      { flight_no: "TG637", flight_date: "2026-09-20" },
    )!;
    expect(seen.position?.lat).toBe(25.1);
    expect(seen.position?.altitude_m).toBe(10668);
    expect(seen.position?.speed_kmh).toBe(889);
  });
});
