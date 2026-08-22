import { describe, expect, it } from "vitest";
import {
  BRAND_VOICE_DEFAULTS,
  brandVoiceDirective,
  brandVoiceSample,
  readBrandVoice,
  stripJargon,
  styleNotice,
} from "@/lib/brandVoice";

describe("brand voice prefs", () => {
  it("falls back to defaults on empty prefs", () => {
    expect(readBrandVoice({})).toEqual(BRAND_VOICE_DEFAULTS);
    expect(readBrandVoice(null)).toEqual(BRAND_VOICE_DEFAULTS);
  });

  it("clamps a bad intensity to the middle setting", () => {
    expect(readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: 9 }).brand_voice_intensity).toBe(2);
  });

  it("respects an explicit jargon opt-out", () => {
    expect(readBrandVoice({ brand_voice_no_jargon: false }).brand_voice_no_jargon).toBe(false);
  });
});

describe("jargon scrub", () => {
  it("replaces database and transport words", () => {
    const out = stripJargon("The webhook payload failed to sync to the database.");
    expect(out).not.toMatch(/webhook|payload|database/i);
    expect(out).toMatch(/live link/);
  });

  it("is a no-op when there is nothing technical", () => {
    expect(stripJargon("A booking was cancelled.")).toBe("A booking was cancelled.");
  });
});

describe("notice styling", () => {
  const ec = (i: 1 | 2 | 3) =>
    readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: i });

  it("leaves the facts intact and drops exclamation marks", () => {
    const out = styleNotice("Payment failed for booking 42!", ec(2));
    expect(out).toContain("booking 42");
    expect(out).not.toContain("!");
  });

  it("adds no opener at the lightest seasoning", () => {
    expect(styleNotice("A booking changed.", ec(1))).toBe("A booking changed.");
  });

  it("only seasons the first line", () => {
    const out = styleNotice("A booking changed.\nOpen Vanta to act on it.", ec(3));
    expect(out.split("\n")[1]).toBe("Open Vanta to act on it.");
    expect(out.split("\n")[0].startsWith("Look —")).toBe(true);
  });

  it("keeps neutral tone untouched apart from jargon", () => {
    const neutral = readBrandVoice({});
    expect(styleNotice("A booking changed.", neutral)).toBe("A booking changed.");
  });
});

describe("directive", () => {
  it("carries the jargon ban when enabled", () => {
    expect(brandVoiceDirective(readBrandVoice({}))).toMatch(/No tech jargon/);
  });

  it("omits the jargon ban when disabled", () => {
    expect(brandVoiceDirective(readBrandVoice({ brand_voice_no_jargon: false }))).not.toMatch(/No tech jargon/);
  });

  it("names the East Coast accent at full intensity", () => {
    const d = brandVoiceDirective(readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: 3 }));
    expect(d).toMatch(/Full East Coast tone/);
  });

  it("samples through the real formatter", () => {
    expect(brandVoiceSample(readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: 2 }))).toMatch(/^Heads up —/);
  });
});
