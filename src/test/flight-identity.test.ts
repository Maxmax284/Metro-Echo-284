import { describe, expect, it } from "vitest";
import {
  boardIdentity,
  boardWords,
  carrierId,
  checkInWords,
  isCodeshare,
  mergeIdentity,
  operatorWords,
} from "@/lib/flightIdentity";
import { normalizeAviationstack } from "@/lib/flightStatus";

const payload = (codeshared: unknown) => ({
  data: [
    {
      flight_date: "2026-09-19",
      flight_status: "scheduled",
      airline: { name: "thai airways international", iata: "tg" },
      flight: { iata: "TG6285", icao: "THA6285", codeshared },
      departure: { iata: "IAD", scheduled: "2026-09-19T01:15:00+00:00" },
      arrival: { iata: "TPE", scheduled: "2026-09-20T05:10:00+00:00" },
    },
  ],
});

describe("normalizeAviationstack identity", () => {
  it("keeps the airline that actually flies it", () => {
    const live = normalizeAviationstack(
      payload({ airline_name: "eva air", airline_iata: "br", flight_iata: "br3" }),
      { flight_no: "TG6285", flight_date: "2026-09-19" },
    );
    expect(live?.operated_by?.carrier).toBe("eva air");
    expect(live?.operated_by?.flight_no).toBe("BR3");
    expect(live?.marketed_as?.flight_no).toBe("TG6285");
  });

  it("finds the flight when it was filed under the operating number", () => {
    const live = normalizeAviationstack(
      payload({ airline_name: "eva air", airline_iata: "br", flight_iata: "br3" }),
      { flight_no: "BR3", flight_date: "2026-09-19" },
    );
    expect(live).not.toBeNull();
    expect(live?.operated_by?.flight_no).toBe("BR3");
  });

  it("claims no codeshare when the provider carried none", () => {
    const live = normalizeAviationstack(payload(null), { flight_no: "TG6285", flight_date: "2026-09-19" });
    expect(live?.operated_by ?? null).toBeNull();
    expect(live?.marketed_as ?? null).toBeNull();
  });
});

describe("identity words", () => {
  const id = mergeIdentity(
    { marketing: carrierId({ carrier: "Thai Airways", flight_no: "TG6285" }), operating: null, aliases: [] },
    { operating: carrierId({ carrier: "eva air", carrier_code: "br", flight_no: "br3" }) },
  );

  it("sends you looking for the operating flight", () => {
    expect(isCodeshare(id)).toBe(true);
    expect(boardIdentity(id)?.flight_no).toBe("BR3");
    expect(boardWords(id, "Taipei")).toContain("Look for EVA Air BR3 to Taipei");
    expect(boardWords(id, "Taipei")).toContain("TG6285");
    expect(operatorWords(id)).toContain("EVA Air operates this flight");
  });

  it("keeps a displaced identity as an alias instead of losing it", () => {
    const next = mergeIdentity(id, { operating: carrierId({ carrier: "Other", flight_no: "XX1" }) });
    expect(next.aliases.some((a) => a.flight_no === "BR3")).toBe(true);
  });

  it("says nothing about a check-in area with no page behind it", () => {
    expect(checkInWords(id)).toBeNull();
    const withZone = mergeIdentity(id, {
      check_in: {
        where: "EVA Air, Zone 2, main terminal",
        source_url: "https://www.evaair.com/x",
        source_host: "evaair.com",
        read_at: "2026-09-19T10:00:00Z",
      },
    });
    expect(checkInWords(withZone)).toContain("Zone 2");
    expect(checkInWords(withZone)).toContain("evaair.com");
  });
});
