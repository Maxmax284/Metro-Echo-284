import { describe, expect, it } from "vitest";
import { HUM_ROOMS, roomArrivalSound } from "@/lib/streetSound";

describe("station sound routing", () => {
  it("the three main rooms arrive on the split-flap clack", () => {
    expect(roomArrivalSound("today")).toBe("solari");
    expect(roomArrivalSound("work")).toBe("solari");
    expect(roomArrivalSound("receipts")).toBe("solari");
  });

  it("Ask keeps its zippo, everywhere else the turnstile", () => {
    expect(roomArrivalSound("ask")).toBe("zippo");
    expect(roomArrivalSound("memory")).toBe("turnstile");
    expect(roomArrivalSound("awareness")).toBe("turnstile");
  });

  it("the hum rides only under the main rooms", () => {
    expect(HUM_ROOMS.has("today")).toBe(true);
    expect(HUM_ROOMS.has("work")).toBe(true);
    expect(HUM_ROOMS.has("receipts")).toBe(true);
    expect(HUM_ROOMS.has("ask")).toBe(false);
    expect(HUM_ROOMS.has("awareness")).toBe(false);
  });
});
