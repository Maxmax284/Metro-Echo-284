// A playbook is kept or it does not exist. Echo prepares; it never acts.
import { describe, expect, it } from "vitest";
import {
  matchTrouble, noPlaybookWords, playbook, troubleAnswer, troubleTitles, TROUBLE_LAW,
} from "@/lib/trouble";

describe("reading the situation", () => {
  it("recognises the ordinary disasters", () => {
    expect(matchTrouble("I lost my wallet in Bangkok")?.id).toBe("lost_wallet");
    expect(matchTrouble("the atm ate my card")?.id).toBe("card_eaten");
    expect(matchTrouble("my card was declined at dinner")?.id).toBe("card_declined");
    expect(matchTrouble("I missed my connection in Tokyo")?.id).toBe("missed_transport");
    expect(matchTrouble("my bag didn't come out")?.id).toBe("baggage");
    expect(matchTrouble("lost my passport")?.id).toBe("lost_passport");
  });

  it("prefers the longer, more specific phrase", () => {
    // "card" words overlap; "atm ate" must win over a bare decline.
    expect(matchTrouble("atm ate my card and the card not working now")?.id).toBe("card_eaten");
  });

  it("returns nothing for a situation it never wrote up", () => {
    expect(matchTrouble("my dog is sulking")).toBeNull();
    expect(matchTrouble("")).toBeNull();
    expect(matchTrouble(null)).toBeNull();
  });
});

describe("what comes back", () => {
  it("leads with one first move, then the order", () => {
    const line = troubleAnswer("I lost my wallet");
    expect(line).toMatch(/^Lost wallet\. First: Freeze the cards/);
    expect(line).toContain("1)");
    expect(line).toContain("Echo needs from you:");
  });

  it("always says what Echo will not do", () => {
    for (const title of troubleTitles()) {
      const pb = playbook(
        // find by title through the registry
        ["lost_wallet", "lost_passport", "card_declined", "card_eaten", "dead_phone",
          "missed_transport", "hotel_problem", "taxi_problem", "locked_out", "missing_package",
          "utility_outage", "vehicle_trouble", "broken_appliance", "where_for_care",
          "prescription", "paperwork", "gov_office", "baggage", "fee_check",
        ].find((id) => playbook(id)?.title === title)!,
      )!;
      expect(pb.never.length).toBeGreaterThan(10);
      expect(pb.steps.length).toBeGreaterThan(2);
      expect(pb.needs.length).toBeGreaterThan(0);
      expect(pb.checked_on).toBe("2026-09-16");
    }
  });

  it("stamps the day it was checked", () => {
    expect(troubleAnswer("locked out")).toContain("checked 2026-09-16");
  });

  it("refuses to invent steps and says what it does keep", () => {
    const line = troubleAnswer("my houseplant is unionising");
    expect(line).toMatch(/no kept playbook/i);
    expect(line).toContain("Lost wallet");
    expect(line).toContain(TROUBLE_LAW);
  });

  it("asks what went wrong when told nothing", () => {
    expect(noPlaybookWords("")).toMatch(/needs to know what actually went wrong/i);
  });

  it("never diagnoses on the care question", () => {
    const line = troubleAnswer("should i go to a clinic or the hospital");
    expect(line).toMatch(/does not diagnose/i);
    expect(line).toMatch(/emergency number/i);
  });
});
