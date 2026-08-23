import { describe, expect, it } from "vitest";
import { shouldSuggestPromotion } from "@/lib/askPromotion";
import { COMPANION_TOOLS, getToolAvailability, type Tool } from "@/lib/companionTools";

describe("ask promotion rules", () => {
  it("stays quiet on a short exchange", () => {
    expect(shouldSuggestPromotion({ messageCount: 2 })).toBe(false);
  });
  it("suggests once the thread produced something", () => {
    expect(shouldSuggestPromotion({ messageCount: 2, hasOutputs: true })).toBe(true);
  });
  it("suggests on a long exchange", () => {
    expect(shouldSuggestPromotion({ messageCount: 6 })).toBe(true);
  });
  it("never suggests what you are already looking at", () => {
    expect(shouldSuggestPromotion({ messageCount: 20, hasOutputs: true, inAskRoom: true })).toBe(false);
  });
});

describe("registry metadata gates", () => {
  const base: Tool = { ...COMPANION_TOOLS[0], surfaces: ["*"], modes: ["advisor"], provider: "none" };
  const opts = { surface: "conversation", mode: "advisor" as const, isOwner: true, controls: null };

  it("hides registry-only tools from direct invocation", () => {
    const t = { ...base, hiddenFromDirectInvocation: true };
    expect(getToolAvailability(t, { ...opts, direct: true }).available).toBe(false);
    expect(getToolAvailability(t, opts).available).toBe(true);
  });

  it("enforces allowed scopes", () => {
    const t = { ...base, allowedScopes: ["personal" as const] };
    expect(getToolAvailability(t, { ...opts, scope: "organization" }).available).toBe(false);
    expect(getToolAvailability(t, { ...opts, scope: "personal" }).available).toBe(true);
  });
});
