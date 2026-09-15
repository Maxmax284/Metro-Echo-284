// The floating thread controls: they appear when they are useful and vanish
// when the person is already looking at the newest turn.
import { describe, it, expect } from "vitest";
import { jumpState, AWAY_FROM_BOTTOM, DEEP_FROM_TOP } from "@/components/ask/ThreadNav";

const at = (scrollTop: number, scrollHeight = 4000, clientHeight = 800) => ({ scrollTop, scrollHeight, clientHeight });

describe("jumpState", () => {
  it("shows nothing at the bottom of a thread", () => {
    expect(jumpState(at(3200))).toEqual({ showLatest: false, showTop: false });
  });

  it("shows nothing when barely off the bottom", () => {
    expect(jumpState(at(3200 - (AWAY_FROM_BOTTOM - 20))).showLatest).toBe(false);
  });

  it("offers jump to latest once the newest turn is off screen", () => {
    expect(jumpState(at(3200 - (AWAY_FROM_BOTTOM + 20))).showLatest).toBe(true);
  });

  it("offers a route to the start only from deep down a long thread", () => {
    expect(jumpState(at(400)).showTop).toBe(false);
    expect(jumpState(at(DEEP_FROM_TOP + 100, 9000, 800)).showTop).toBe(true);
  });

  it("never offers the start route while sitting at the newest turn", () => {
    expect(jumpState(at(8200, 9000, 800))).toEqual({ showLatest: false, showTop: false });
  });

  it("handles a thread shorter than the viewport", () => {
    expect(jumpState(at(0, 600, 800))).toEqual({ showLatest: false, showTop: false });
  });
});
