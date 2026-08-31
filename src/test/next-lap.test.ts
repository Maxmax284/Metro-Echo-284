// Next lap — first-hour comprehension, bridge honesty, time/place honesty,
// and document comparison. Pure logic only; no network, no database.
import { describe, expect, it } from "vitest";
import { DESK_ROLES, DESK_VERB, type DeskKey } from "@/lib/deskRoles";
import { INTAKE_DOORS } from "@/components/intake/GotSomethingChooser";
import {
  bridgeReviewLabel,
  isBridgeSource,
  PROVENANCE_LABEL,
  resolveProvenance,
} from "@/lib/vantaNouns";
import {
  inferenceNote,
  isInferred,
  placeSourceLine,
  timeSourceLine,
  timezoneName,
} from "@/lib/honestContext";
import { classifyLine, compareVersions, diffHeadline } from "@/lib/documentDiff";

const KEYS = Object.keys(DESK_ROLES) as DeskKey[];

describe("verb-first desk labels", () => {
  it("gives every desk a verb line", () => {
    for (const k of KEYS) {
      const verb = DESK_VERB[k];
      expect(verb, k).toBeTruthy();
      expect(verb.endsWith("."), k).toBe(true);
    }
  });

  it("leads with a verb, not a noun phrase", () => {
    const verbs = ["Keep", "File", "Approve", "Build", "Review", "See", "Find", "Investigate", "Read"];
    for (const k of KEYS) {
      const first = DESK_VERB[k].split(" ")[0];
      expect(verbs, `${k}: ${DESK_VERB[k]}`).toContain(first);
    }
  });

  it("never invents a new object name", () => {
    const banned = ["widget", "module", "entity", "record store", "pipeline"];
    for (const k of KEYS) {
      for (const word of banned) {
        expect(DESK_VERB[k].toLowerCase(), k).not.toContain(word);
      }
    }
  });
});

describe("three-choice intake chooser", () => {
  it("offers exactly three doors", () => {
    expect(INTAKE_DOORS).toHaveLength(3);
    expect(INTAKE_DOORS.map((d) => d.key)).toEqual(["park", "promise", "step"]);
  });

  it("never promises execution", () => {
    for (const d of INTAKE_DOORS) {
      const text = `${d.label} ${d.says} ${d.lands}`.toLowerCase();
      expect(text, d.key).not.toContain("automatically");
      /* Denials are fine ("nothing runs"); claims of execution are not. */
      expect(text, d.key).not.toMatch(/\b(vanta|it) (runs|executes|sends)\b/);
    }
  });

  it("says where each door lands", () => {
    for (const d of INTAKE_DOORS) {
      expect(d.lands.toLowerCase(), d.key).toMatch(/inbox|commitments|actions/);
    }
    /* The prepared-step door must state that approval is still required. */
    const step = INTAKE_DOORS.find((d) => d.key === "step")!;
    expect(step.lands.toLowerCase()).toContain("approval");
  });
});

describe("bridges bring drafts, not authority", () => {
  it("names Ground Truth Hub, CampCore and Fenrir", () => {
    expect(resolveProvenance("ground_truth_hub")).toBe("hub");
    expect(resolveProvenance("lmt_camp_state")).toBe("hub");
    expect(resolveProvenance("campcore")).toBe("campcore");
    expect(resolveProvenance("fenrir_lock")).toBe("fenrir");
    expect(PROVENANCE_LABEL.hub).toBe("From Ground Truth Hub");
  });

  it("marks bridge arrivals as needing review", () => {
    expect(bridgeReviewLabel("ground_truth_hub")).toBe("Drafted from Ground Truth Hub · needs review");
    expect(isBridgeSource("ground_truth_hub")).toBe(true);
  });

  it("does not treat a local capture as a bridge", () => {
    expect(isBridgeSource("telegram")).toBe(false);
    expect(isBridgeSource("you")).toBe(false);
    expect(bridgeReviewLabel("telegram")).toBeNull();
  });
});

describe("honest time and place", () => {
  it("shortens a zone without losing it", () => {
    expect(timezoneName("Asia/Bangkok")).toBe("Bangkok");
    expect(timezoneName(null)).toBe("Unknown timezone");
  });

  it("never presents a browser clock as confirmed", () => {
    const line = timeSourceLine({ timezone: "Asia/Bangkok", source: "device", confidence: "low" });
    expect(line).toContain("device source");
    expect(line).toContain("not confirmed");
    expect(line).not.toMatch(/\bzone confirmed\b|timezone confirmed/);
    expect(isInferred("device", "low")).toBe(true);
    expect(inferenceNote("device", "low")).toBeTruthy();
  });

  it("says where a confirmed zone came from", () => {
    expect(timeSourceLine({ timezone: "Asia/Bangkok", source: "calendar" })).toBe(
      "Bangkok time · from calendar",
    );
    expect(timeSourceLine({ timezone: "Asia/Bangkok", source: "event" })).toContain(
      "timezone confirmed from event source",
    );
  });

  it("keeps an approximate place approximate", () => {
    const line = placeSourceLine({ label: "Bangkok", source: "coarse" });
    expect(line).toContain("Approximate area");
    expect(line).toContain("coarse location");
    expect(isInferred("coarse")).toBe(true);
  });

  it("does not invent a place when there is no signal", () => {
    expect(placeSourceLine({ source: "unknown" })).toContain("not guessing");
  });

  it("treats a saved place as a fact", () => {
    expect(isInferred("saved", "high")).toBe(false);
    expect(inferenceNote("saved", "high")).toBeNull();
  });
});

describe("document version compare", () => {
  it("reports additions and removals", () => {
    const d = compareVersions("one\ntwo\nthree", "one\ntwo\nfour");
    expect(d.added).toBe(1);
    expect(d.removed).toBe(1);
    expect(diffHeadline(d)).toContain("added");
  });

  it("says nothing changed when nothing changed", () => {
    const d = compareVersions("same line", "same line");
    expect(d.added).toBe(0);
    expect(d.removed).toBe(0);
    expect(diffHeadline(d)).toBe("No text differences between these two versions.");
  });

  it("flags dates, amounts, parties and obligations", () => {
    expect(classifyLine("Payment due 2026-09-01")).toBe("date");
    expect(classifyLine("Fee of $2,500 per month")).toBe("amount");
    expect(classifyLine("Contractor shall deliver the report")).toBe("obligation");
    expect(classifyLine("Agreement between the parties")).toBe("party");
    expect(classifyLine("Header text")).toBe("other");
  });

  it("names its own uncertainty instead of guessing", () => {
    const d = compareVersions("Fee of $100", "Fee of $200");
    expect(d.noted.some((c) => c.kind === "amount")).toBe(true);
    expect(d.uncertainty.join(" ")).toContain("not the arithmetic");
  });

  it("never renders a verdict", () => {
    const d = compareVersions("Contractor shall deliver by 2026-01-01", "Contractor shall deliver by 2026-02-01");
    const text = [diffHeadline(d), ...d.uncertainty].join(" ").toLowerCase();
    expect(text).not.toMatch(/\brisky\b|\byou should\b|\brecommend\b|\bbetter\b/);
  });
});
