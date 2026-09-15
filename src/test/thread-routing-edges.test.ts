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

describe("inbound routing — edges", () => {
  it("stops stretching a continuation once it is far past cold", () => {
    const r = routeInbound({
      ...base,
      text: "and the deposit?",
      msSinceLastMessage: SITUATION_IDLE_MS * 4 + 1,
    });
    expect(r.decision).toBe("fresh");
    expect(r.reason).toMatch(/cold/);
  });

  it("treats an open thread with no last-message time as cold", () => {
    const r = routeInbound({ ...base, msSinceLastMessage: null });
    expect(r.decision).toBe("fresh");
  });

  it("does not stretch a continuation when there is no clock to judge by", () => {
    const r = routeInbound({ ...base, text: "and the deposit?", msSinceLastMessage: null });
    expect(r.decision).toBe("fresh");
  });

  it("assumes the open thread shares scope when its scope is unknown", () => {
    for (const openThreadScope of [null, undefined]) {
      const r = routeInbound({ ...base, openThreadScope });
      expect(r.decision).toBe("continue");
    }
  });

  it("keeps workspace work inside the workspace", () => {
    const r = routeInbound({ ...base, scope: "organization", openThreadScope: "organization" });
    expect(r.decision).toBe("continue");
    const crossed = routeInbound({ ...base, scope: "organization", openThreadScope: "personal" });
    expect(crossed.decision).toBe("fresh");
    expect(crossed.reason).toMatch(/scope/);
  });

  it("never attaches across scope even when only a record thread is named", () => {
    const r = routeInbound({
      ...base, scope: "organization", openThreadScope: "personal", contextThreadId: "t-1",
    });
    expect(r.decision).toBe("fresh");
    expect(r.threadId).toBeNull();
  });

  it("prefers the notice replied to over the record's thread", () => {
    const r = routeInbound({ ...base, replyToThreadId: "t-notice", contextThreadId: "t-record" });
    expect(r.threadId).toBe("t-notice");
    expect(r.reason).toMatch(/raised/);
  });

  it("attaches a reply even when nothing is open on the channel", () => {
    const r = routeInbound({
      ...base, hasOpenThread: false, msSinceLastMessage: null, replyToThreadId: "t-notice",
    });
    expect(r.decision).toBe("attach");
    expect(r.threadId).toBe("t-notice");
  });

  it("reads a reset request through stray spacing and capitals", () => {
    for (const text of ["  New Thread ", "START OVER", "Never mind", "/reset"]) {
      expect(asksForFreshStart(text)).toBe(true);
    }
  });

  it("does not mistake ordinary words for a reset", () => {
    for (const text of [
      "news about the deposit", "starting the paperwork tomorrow",
      "different from what they said", "I forget the name of the hotel",
    ]) {
      expect(asksForFreshStart(text)).toBe(false);
    }
  });

  it("does not treat a new subject as a continuation", () => {
    for (const text of ["dentist moved to Thursday", "book the ferry", "Nikki needs the waiver"]) {
      expect(readsAsContinuation(text)).toBe(false);
    }
  });

  it("survives an empty or emoji-only message without inventing a reset", () => {
    for (const text of ["", "   ", "👍"]) {
      expect(asksForFreshStart(text)).toBe(false);
      expect(routeInbound({ ...base, text }).decision).toBe("continue");
    }
  });

  it("keeps a draft answer in the draft even when it is a bare yes far past cold", () => {
    const r = routeInbound({
      ...base,
      text: "yes",
      msSinceLastMessage: SITUATION_IDLE_MS * 10,
      openThreadAwaitingAnswer: true,
    });
    expect(r.decision).toBe("continue");
    expect(r.reason).toMatch(/waiting on an answer/);
  });

  it("never lets an awaiting draft override a scope change", () => {
    const r = routeInbound({
      ...base, scope: "organization", openThreadScope: "personal", openThreadAwaitingAnswer: true,
    });
    expect(r.decision).toBe("fresh");
  });

  it("writes a receipt line for every verdict, and never leaks a thread id when fresh", () => {
    const fresh = routeInbound({ ...base, hasOpenThread: false, msSinceLastMessage: null });
    const attach = routeInbound({ ...base, replyToThreadId: "t-9" });
    const cont = routeInbound(base);
    expect(routeReceipt(fresh)).toBe("Started a new situation — nothing open on this channel yet.");
    expect(routeReceipt(attach)).toMatch(/^Continued an existing situation — .+\.$/);
    expect(routeReceipt(cont)).toMatch(/^Stayed in the open situation — .+\.$/);
    expect(fresh.threadId).toBeNull();
    expect(cont.threadId).toBeNull();
  });

  it("is pure — the same signal always lands the same way", () => {
    const signal = { ...base, text: "and Friday?", msSinceLastMessage: SITUATION_IDLE_MS + 5 };
    const first = routeInbound(signal);
    for (let i = 0; i < 5; i++) expect(routeInbound(signal)).toEqual(first);
  });
});
