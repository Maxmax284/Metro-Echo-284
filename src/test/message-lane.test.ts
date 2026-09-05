import { describe, it, expect } from "vitest";
import { readMessageLane, surfacedArrivals, heldBackLine, type Arrival } from "@/lib/messageLane";

const NOW = new Date("2026-09-05T07:00:00Z").getTime();

function arrival(over: Partial<Arrival> = {}): Arrival {
  return {
    id: over.id ?? "a1",
    text: over.text ?? "Can you send the invoice",
    at: over.at ?? new Date(NOW - 10 * 60_000).toISOString(),
    channel: over.channel ?? "telegram",
    unfiled: over.unfiled ?? true,
    ...over,
  };
}

describe("messageLane", () => {
  it("surfaces an unfiled arrival with a reason and a reveal", () => {
    const [item] = readMessageLane([arrival()], { now: NOW });
    expect(item.surface).toBe(true);
    expect(item.reason).toMatch(/not been filed/);
    expect(item.why?.source).toContain("Telegram");
    expect(item.why?.at).toBeTruthy();
  });

  it("holds back a filed, untied arrival as below the bar", () => {
    const [item] = readMessageLane([arrival({ unfiled: false })], { now: NOW });
    expect(item.surface).toBe(false);
    expect(item.suppressed).toBe("below_threshold");
  });

  it("names duplicates rather than showing them twice", () => {
    const items = readMessageLane(
      [arrival({ id: "a" }), arrival({ id: "b" })],
      { now: NOW },
    );
    expect(surfacedArrivals(items)).toHaveLength(1);
    expect(items.find((i) => !i.surface)?.suppressed).toBe("duplicate");
  });

  it("suppresses acknowledged and stale arrivals", () => {
    const items = readMessageLane(
      [
        arrival({ id: "ack", text: "seen", acknowledged: true }),
        arrival({ id: "old", text: "ancient", at: new Date(NOW - 30 * 86400_000).toISOString() }),
      ],
      { now: NOW },
    );
    expect(items.find((i) => i.arrival.id === "ack")?.suppressed).toBe("acknowledged");
    expect(items.find((i) => i.arrival.id === "old")?.suppressed).toBe("stale");
  });

  it("keeps a time-sensitive arrival even in quiet hours, and ranks it first", () => {
    const items = readMessageLane(
      [
        arrival({ id: "plain", text: "just a thought" }),
        arrival({ id: "urgent", text: "moving the 4pm", timeSensitive: true }),
      ],
      { now: NOW, quietHours: true },
    );
    expect(items[0].arrival.id).toBe("urgent");
    expect(items[0].surface).toBe(true);
    expect(items.find((i) => i.arrival.id === "plain")?.suppressed).toBe("quiet_hours");
  });

  it("spends an attention budget instead of dumping an inbox", () => {
    const items = readMessageLane(
      [1, 2, 3, 4, 5].map((n) => arrival({ id: `m${n}`, text: `message ${n}` })),
      { now: NOW, budget: 2 },
    );
    expect(surfacedArrivals(items)).toHaveLength(2);
    expect(items.filter((i) => i.suppressed === "attention_budget")).toHaveLength(3);
    expect(heldBackLine(items)).toMatch(/3 other arrivals/);
  });

  it("says out loud when the words were heard rather than typed", () => {
    const [item] = readMessageLane([arrival({ heardOrRead: "heard", attachment: "voice note" })], { now: NOW });
    expect(item.why?.reason).toMatch(/heard/);
    expect(item.why?.whatChanged).toMatch(/voice note/);
  });
});

describe("looksLikeCapture", () => {
  it("keeps chat out of the filing lane", async () => {
    const { looksLikeCapture } = await import("@/lib/messageLane");
    expect(looksLikeCapture("Who are you?")).toBe(false);
    expect(looksLikeCapture("Hey")).toBe(false);
    expect(looksLikeCapture("thanks!")).toBe(false);
    expect(looksLikeCapture("/help")).toBe(false);
    expect(looksLikeCapture("How does this work")).toBe(false);
  });

  it("keeps a real capture in it", async () => {
    const { looksLikeCapture } = await import("@/lib/messageLane");
    expect(looksLikeCapture("Nikki needs the gym waiver draft by Friday")).toBe(true);
    expect(looksLikeCapture("Paid 4,500 baht for the van repair today")).toBe(true);
  });
});
