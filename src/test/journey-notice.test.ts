// A heads-up is only as loud as the change behind it.
import { describe, expect, it } from "vitest";
import {
  BIG_DELAY_MIN,
  classifyJourneyNews,
  journeyNotice,
  mayPingDuringQuietHours,
  movedMinutes,
} from "@/lib/journeyNotice";

const CAVEAT = "Double-check the board in the terminal.";

describe("how loud a change is", () => {
  it("treats a cancellation as the loudest thing on the list", () => {
    expect(classifyJourneyNews(["TG601 is now cancelled."])).toBe("critical");
    expect(classifyJourneyNews(["TG601 is recorded as not flown."])).toBe("critical");
  });

  it("treats a gate or terminal move as worth interrupting for", () => {
    expect(classifyJourneyNews(["TG601 now says gate D4."])).toBe("high");
    expect(classifyJourneyNews(["TG601 now says terminal 2."])).toBe("high");
  });

  it("reads how far a flight moved and only shouts past the threshold", () => {
    expect(movedMinutes("TG601 leaves 45 min later, 14:20.")).toBe(45);
    expect(movedMinutes("TG601 leaves 10 min earlier, 13:25.")).toBe(-10);
    expect(movedMinutes("TG601 now says gate D4.")).toBeNull();
    expect(BIG_DELAY_MIN).toBe(30);
    expect(classifyJourneyNews(["TG601 leaves 45 min later, 14:20."])).toBe("high");
    expect(classifyJourneyNews(["TG601 leaves 10 min later, 13:45."])).toBe("low");
  });

  it("lets the worst item in the batch set the level", () => {
    expect(classifyJourneyNews(["TG601 leaves 5 min later, 13:40.", "TG601 is now cancelled."])).toBe("critical");
  });
});

describe("one heads-up, or nothing", () => {
  it("says nothing when nothing moved", () => {
    expect(journeyNotice({ news: [], whereWords: "At the airport.", landed: null, caveat: CAVEAT })).toBeNull();
    expect(journeyNotice({ news: ["", "  "], whereWords: "x", landed: null, caveat: CAVEAT })).toBeNull();
  });

  it("names the change in the title and keeps the caveat in the body", () => {
    const n = journeyNotice({
      news: ["TG601 now says gate D4."],
      whereWords: "At the airport.",
      landed: null,
      caveat: CAVEAT,
    });
    expect(n?.title).toBe("Your gate moved");
    expect(n?.body).toContain("gate D4");
    expect(n?.body).toContain(CAVEAT);
    expect(n?.urgency).toBe("high");
    expect(n?.reachMessaging).toBe(true);
    expect(n?.priority).toBe(70);
  });

  it("keeps a small delay quiet on messaging but still writes it to Today", () => {
    const n = journeyNotice({
      news: ["TG601 leaves 10 min later, 13:45."],
      whereWords: "Not started.",
      landed: null,
      caveat: CAVEAT,
    });
    expect(n?.reachMessaging).toBe(false);
    expect(n?.priority).toBe(20);
  });

  it("always reaches you the moment you are on the ground with a leg to go", () => {
    const n = journeyNotice({ news: [], whereWords: "x", landed: "You are on the ground at Tokyo Haneda.", caveat: CAVEAT });
    expect(n?.title).toBe("You are on the ground");
    expect(n?.reachMessaging).toBe(true);
  });

  it("only breaks quiet hours for a cancelled or diverted leg", () => {
    expect(mayPingDuringQuietHours("critical")).toBe(true);
    expect(mayPingDuringQuietHours("high")).toBe(false);
    expect(mayPingDuringQuietHours("low")).toBe(false);
  });
});
