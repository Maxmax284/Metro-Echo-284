import { describe, it, expect } from "vitest";
import {
  BODY_DEPTH,
  bodyForDevice,
  depthDirective,
  fitToBody,
  depthAgrees,
  sentencesOf,
} from "@/lib/responseDepth";

describe("responseDepth", () => {
  it("maps devices to bodies, defaulting to desk", () => {
    expect(bodyForDevice("wearable")).toBe("wrist");
    expect(bodyForDevice("earbuds")).toBe("spoken");
    expect(bodyForDevice("phone")).toBe("phone");
    expect(bodyForDevice(null)).toBe("desk");
  });

  it("keeps every body within its sentence budget", () => {
    const full =
      "Two things are waiting on you. The roster for Nikki is a day late. From Telegram, twelve minutes ago. Open the inbox to file it.";
    for (const body of Object.keys(BODY_DEPTH) as (keyof typeof BODY_DEPTH)[]) {
      const out = fitToBody(full, body);
      expect(sentencesOf(out).length).toBeLessThanOrEqual(BODY_DEPTH[body].sentences[1]);
      expect(depthAgrees(full, out)).toBe(true);
    }
  });

  it("names the body and the answer order in the directive", () => {
    const d = depthDirective("telegram");
    expect(d).toMatch(/telegram/i);
    expect(d).toMatch(/ANSWER ORDER/);
    expect(d).toMatch(/Didn't run/);
  });

  it("gives phone and telegram room for a week without passing the desk", () => {
    expect(BODY_DEPTH.phone.sentences[1]).toBe(12);
    expect(BODY_DEPTH.telegram.sentences[1]).toBe(12);
    for (const body of ["phone", "telegram"] as const) {
      const d = depthDirective(body);
      expect(d).toMatch(/WHEN THEY ASK FOR THE WEEK/);
      expect(d).toMatch(/one line per day/);
      expect(d).toMatch(/up to seven/);
    }
  });

  it("never lets a smaller body carry more than a larger one", () => {
    expect(BODY_DEPTH.wrist.sentences[1]).toBeLessThanOrEqual(BODY_DEPTH.telegram.sentences[1]);
    expect(BODY_DEPTH.telegram.sentences[1]).toBeLessThanOrEqual(BODY_DEPTH.phone.sentences[1]);
    expect(BODY_DEPTH.phone.sentences[1]).toBeLessThanOrEqual(BODY_DEPTH.desk.sentences[1]);
  });
});
