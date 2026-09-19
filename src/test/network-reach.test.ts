// Reach is reach: Wi-Fi, cellular or a wired link all count as being back on.
import { describe, expect, it } from "vitest";
import { QUIET_SKY, reachKind } from "@/hooks/useNetworkReach";

describe("network reach", () => {
  it("names the link when the browser says what it is", () => {
    expect(reachKind({ type: "wifi" })).toBe("wifi");
    expect(reachKind({ type: "cellular" })).toBe("cellular");
    expect(reachKind({ type: "ethernet" })).toBe("wired");
  });

  it("leaves an unnamed link unknown rather than guessing Wi-Fi", () => {
    expect(reachKind({ effectiveType: "4g" })).toBe("unknown");
    expect(reachKind(null)).toBe("unknown");
  });

  it("promises to pick the feed back up on either kind of network", () => {
    expect(QUIET_SKY).toContain("Wi-Fi or a mobile network");
  });
});
