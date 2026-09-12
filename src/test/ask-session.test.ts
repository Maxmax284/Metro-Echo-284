import { describe, it, expect, beforeEach } from "vitest";
import {
  getAskSession, setAskMessages, setAskDraft, subscribeAskSession,
  beginAskStream, endAskStream, stopAskStream, streamingThreadIds,
  clearAskSession, adoptAskSession, __resetAskSessions,
} from "@/lib/askSession";

beforeEach(() => __resetAskSessions());

describe("ask session — one live state per thread", () => {
  it("starts blank and unhydrated", () => {
    const s = getAskSession("t1");
    expect(s.messages).toEqual([]);
    expect(s.hydrated).toBe(false);
    expect(s.streaming).toBe(false);
  });

  it("shares turns between two surfaces on the same thread", () => {
    const seen: number[] = [];
    const off = subscribeAskSession("t1", (s) => seen.push(s.messages.length));
    setAskMessages("t1", [{ role: "user", content: "hi" }], { hydrated: true });
    setAskMessages("t1", (p) => [...p, { role: "assistant", content: "" }]);
    off();
    expect(seen).toEqual([1, 2]);
    expect(getAskSession("t1").hydrated).toBe(true);
  });

  it("keeps threads isolated", () => {
    setAskMessages("t1", [{ role: "user", content: "a" }]);
    expect(getAskSession("t2").messages).toEqual([]);
  });

  it("carries a draft across surfaces", () => {
    setAskDraft("t1", "half a thought");
    expect(getAskSession("t1").draft).toBe("half a thought");
  });

  it("lets any surface stop the in-flight turn", () => {
    const ctrl = new AbortController();
    beginAskStream("t1", ctrl);
    expect(streamingThreadIds()).toEqual(["t1"]);
    expect(stopAskStream("t1")).toBe(true);
    expect(ctrl.signal.aborted).toBe(true);
    endAskStream("t1");
    expect(streamingThreadIds()).toEqual([]);
    expect(stopAskStream("t1")).toBe(false);
  });

  it("never discards a thread while its turn is live", () => {
    beginAskStream("t1", new AbortController());
    setAskMessages("t1", [{ role: "user", content: "x" }]);
    clearAskSession("t1");
    expect(getAskSession("t1").messages).toHaveLength(1);
    endAskStream("t1");
    clearAskSession("t1");
    expect(getAskSession("t1").messages).toEqual([]);
  });
});

describe("ask session — handing a pre-thread draft to the real thread", () => {
  it("carries the half-typed line onto the new thread", () => {
    setAskDraft("_none", "book the flight");
    adoptAskSession("_none", "t9");
    expect(getAskSession("t9").draft).toBe("book the flight");
    expect(getAskSession("_none").draft).toBe("");
  });

  it("never overwrites what the target thread already has", () => {
    setAskDraft("_none", "stale");
    setAskDraft("t9", "real");
    setAskMessages("t9", [{ role: "user", content: "already here" }], { hydrated: true });
    adoptAskSession("_none", "t9");
    expect(getAskSession("t9").draft).toBe("real");
    expect(getAskSession("t9").messages).toHaveLength(1);
  });

  it("carries turns and a live stream across", () => {
    setAskMessages("_none", [{ role: "user", content: "hi" }], { hydrated: true });
    beginAskStream("_none", new AbortController());
    adoptAskSession("_none", "t9");
    const s = getAskSession("t9");
    expect(s.messages).toHaveLength(1);
    expect(s.hydrated).toBe(true);
    expect(s.streaming).toBe(true);
  });

  it("is a no-op when there is nothing to adopt", () => {
    setAskDraft("t9", "keep me");
    adoptAskSession("_none", "t9");
    adoptAskSession("t9", "t9");
    expect(getAskSession("t9").draft).toBe("keep me");
  });
});
