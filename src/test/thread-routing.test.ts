import { describe, it, expect } from "vitest";
import {
  routeInbound, routeReceipt, asksForFreshStart, readsAsContinuation,
  SITUATION_IDLE_MS, type InboundSignal,
} from "@/lib/threadRouting";

const base: InboundSignal = {
  text: "how's the deposit looking",
  msSinceLastMessage: 5 * 60 * 1000,
  scope: "personal",
  openThreadScope: "personal",
  hasOpenThread: true,
};

describe("inbound thread routing", () => {
  it("continues the open situation while it is warm", () => {
    const r = routeInbound(base);
    expect(r.decision).toBe("continue");
    expect(routeReceipt(r)).toMatch(/Stayed in the open situation/);
  });

  it("starts fresh when there is nothing open", () => {
    expect(routeInbound({ ...base, hasOpenThread: false, msSinceLastMessage: null }).decision).toBe("fresh");
  });

  it("starts fresh once the last situation goes cold", () => {
    const r = routeInbound({ ...base, msSinceLastMessage: SITUATION_IDLE_MS + 1 });
    expect(r.decision).toBe("fresh");
    expect(r.reason).toMatch(/cold/);
  });

  it("keeps a cold situation open when the wording is only a continuation", () => {
    const r = routeInbound({
      ...base,
      text: "and the deposit?",
      msSinceLastMessage: SITUATION_IDLE_MS + 60_000,
    });
    expect(r.decision).toBe("continue");
  });

  it("attaches a reply to the thread that raised it", () => {
    const r = routeInbound({ ...base, replyToThreadId: "thread-9" });
    expect(r.decision).toBe("attach");
    expect(r.threadId).toBe("thread-9");
    expect(routeReceipt(r)).toMatch(/Continued an existing situation/);
  });

  it("attaches to a record's own thread when one exists", () => {
    const r = routeInbound({ ...base, contextThreadId: "thread-proj" });
    expect(r.decision).toBe("attach");
    expect(r.threadId).toBe("thread-proj");
  });

  it("never crosses scope, even for a reply", () => {
    const r = routeInbound({
      ...base, scope: "personal", openThreadScope: "organization", replyToThreadId: "thread-9",
    });
    expect(r.decision).toBe("fresh");
    expect(r.threadId).toBeNull();
    expect(r.reason).toMatch(/scope/);
  });

  it("honours an explicit request to start over", () => {
    for (const text of ["/new", "new thread", "start over", "different subject", "never mind"]) {
      expect(asksForFreshStart(text)).toBe(true);
      expect(routeInbound({ ...base, text }).decision).toBe("fresh");
    }
    expect(asksForFreshStart("news about the deposit")).toBe(false);
  });

  it("lets an unanswered draft own the next message", () => {
    const r = routeInbound({ ...base, text: "never mind", openThreadAwaitingAnswer: true });
    expect(r.decision).toBe("continue");
    expect(r.reason).toMatch(/waiting on an answer/);
  });

  it("does not make every message its own thread", () => {
    let fresh = 0;
    for (const text of ["ok", "and then?", "what about Friday", "yes do it", "same for the other one"]) {
      if (routeInbound({ ...base, text }).decision === "fresh") fresh++;
      expect(readsAsContinuation(text) || text.startsWith("what about")).toBe(true);
    }
    expect(fresh).toBe(0);
  });
});
