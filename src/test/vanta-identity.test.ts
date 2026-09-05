import { describe, expect, it } from "vitest";
import {
  DUE_OPENERS,
  IDENTITY_ANSWERS,
  OVERDUE_OPENERS,
  VANTA_IDENTITY,
  dueOpener,
  matchIdentityQuestion,
  mentionsVendor,
  overdueOpener,
} from "@/lib/vantaIdentity";
import {
  brandVoiceDirective,
  readBrandVoice,
  toneLevelFor,
  type VoiceContext,
} from "@/lib/brandVoice";

describe("identity block", () => {
  it("states Echo belongs to the user and bans provider identity", () => {
    expect(VANTA_IDENTITY).toMatch(/You are Echo/);
    expect(VANTA_IDENTITY).toMatch(/None of them made you/);
    expect(VANTA_IDENTITY).toMatch(/Never say "as an AI"/);
  });

  it("keeps every canonical answer free of vendor names and assistant-speak", () => {
    for (const answer of Object.values(IDENTITY_ANSWERS)) {
      expect(mentionsVendor(answer)).toBe(false);
      expect(answer).not.toMatch(/as an AI|language model|happy to assist/i);
      expect(answer.length).toBeLessThan(140);
    }
  });
});

describe("identity question matching", () => {
  const cases: Array<[string, keyof typeof IDENTITY_ANSWERS]> = [
    ["who are you?", "who_are_you"],
    ["Who are you", "who_are_you"],
    ["what are you?", "who_are_you"],
    ["what is vanta", "who_are_you"],
    ["who made you?", "who_made_you"],
    ["who created you", "who_made_you"],
    ["what model are you", "what_model"],
    ["which llm is this", "what_model"],
    ["what are you built on?", "what_model"],
    ["are you google?", "are_you_vendor"],
    ["is this gemini", "are_you_vendor"],
  ];
  for (const [input, expected] of cases) {
    it(`routes "${input}" to a canonical answer`, () => {
      expect(matchIdentityQuestion(input)).toBe(expected);
    });
  }

  it("leaves real work alone", () => {
    for (const t of [
      "remind me to call Nikki tomorrow at 9",
      "what's waiting on me",
      "how's the fight card going",
      "save this: gym mats arrive Friday",
    ]) {
      expect(matchIdentityQuestion(t)).toBeNull();
    }
  });
});

describe("personality intensity model", () => {
  const full = readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: 3 });

  it("forces the calmest level on sensitive content", () => {
    expect(toneLevelFor(full, "sensitive")).toBe(1);
  });

  it("caps alerts, errors and answers below the ceiling", () => {
    expect(toneLevelFor(full, "alert")).toBe(2);
    expect(toneLevelFor(full, "error")).toBe(2);
    expect(toneLevelFor(full, "answer")).toBe(2);
  });

  it("lets routine capture wear the full accent", () => {
    expect(toneLevelFor(full, "routine")).toBe(3);
  });

  it("never raises a light setting", () => {
    const light = readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: 1 });
    for (const ctx of ["routine", "answer", "alert", "error", "sensitive"] as VoiceContext[]) {
      expect(toneLevelFor(light, ctx)).toBe(1);
    }
  });

  it("carries the ban list and the context rule into the prompt", () => {
    const serious = brandVoiceDirective(full, "sensitive");
    expect(serious.toLowerCase()).toMatch(/no jokes|no asides/);
    expect(brandVoiceDirective(full, "routine")).toMatch(/NEVER/);
  });
});

describe("reminder openers", () => {
  it("offers more than one opener for due and overdue", () => {
    expect(DUE_OPENERS.length).toBeGreaterThan(1);
    expect(OVERDUE_OPENERS.length).toBeGreaterThan(1);
  });

  it("never shouts and never leaks a vendor name", () => {
    for (const o of [...DUE_OPENERS, ...OVERDUE_OPENERS]) {
      expect(o).not.toMatch(/!/);
      expect(mentionsVendor(o)).toBe(false);
    }
  });

  it("picks from the pools", () => {
    expect(DUE_OPENERS).toContain(dueOpener());
    expect(OVERDUE_OPENERS).toContain(overdueOpener());
  });
});
