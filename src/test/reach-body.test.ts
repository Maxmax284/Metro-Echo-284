import { describe, expect, it } from "vitest";
import { BODY_ROLE, REACH_LAW, planReach, reachWords, type Body } from "@/lib/reachBody";

const all: Body[] = ["phone", "desk", "wrist", "telegram"];

describe("reachBody — which surface gets the news", () => {
  it("keeps ordinary news in Today instead of interrupting anyone", () => {
    const p = planReach("useful", { bodies: all });
    expect(p.reach).toEqual([]);
    expect(p.words).toContain("Kept in Today");
  });

  it("puts a change on the phone but leaves the wrist alone", () => {
    const p = planReach("attention", { bodies: all });
    expect(p.reach).toContain("phone");
    expect(p.reach).not.toContain("wrist");
  });

  it("reaches the wrist and Telegram only when something is waiting on you", () => {
    const p = planReach("time_sensitive", { bodies: all });
    expect(p.reach).toEqual(expect.arrayContaining(["phone", "wrist", "telegram"]));
  });

  it("holds everything during quiet hours", () => {
    const p = planReach("time_sensitive", { bodies: all, quietHours: true });
    expect(p.reach).toEqual([]);
    expect(p.words).toContain("quiet hours");
    expect(p.held.map((h) => h.why)).toContain("quiet hours");
  });

  it("gets through quiet hours only for the thing you cannot sleep through", () => {
    const p = planReach("critical", { bodies: all, quietHours: true });
    expect(p.reach).toContain("wrist");
  });

  it("only uses the desk when the person is actually at it", () => {
    expect(planReach("attention", { bodies: all }).reach).not.toContain("desk");
    expect(planReach("attention", { bodies: all, atThePlatform: true }).reach).toContain("desk");
  });

  it("names a surface it cannot reach instead of counting it as delivered", () => {
    const p = planReach("critical", { bodies: ["phone"] });
    expect(p.held).toEqual(expect.arrayContaining([{ body: "wrist", why: "not reachable right now" }]));
  });

  it("never claims earbuds or glasses are built", () => {
    const p = planReach("critical", { bodies: all });
    const unbuilt = p.held.filter((h) => h.body === "earbuds" || h.body === "glasses");
    expect(unbuilt).toHaveLength(2);
    expect(unbuilt.every((h) => h.why === "not built yet")).toBe(true);
    expect(BODY_ROLE.earbuds.built).toBe(false);
    expect(BODY_ROLE.glasses.built).toBe(false);
  });

  it("says approval stays in the platform on every reach", () => {
    expect(planReach("critical", { bodies: all }).words).toContain("in the platform");
  });
});

describe("reachBody — how Echo describes its own surfaces", () => {
  it("gives every surface a job and an edge", () => {
    const text = reachWords();
    for (const label of ["your phone", "the desk", "your watch", "Telegram", "earbuds", "glasses"]) {
      expect(text).toContain(label);
    }
    expect(text).toContain("Not built yet.");
  });

  it("says the wrist can never approve anything", () => {
    expect(reachWords()).toContain("never approve");
  });

  it("carries the standing law", () => {
    expect(reachWords()).toContain(REACH_LAW);
    expect(REACH_LAW).toContain("never always-watching");
  });
});
