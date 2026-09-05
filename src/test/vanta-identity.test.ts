import { describe, expect, it } from "vitest";
import {
  IDENTITY_ANSWERS,
  VANTA_CORE_VOICE,
  VANTA_IDENTITY,
  VANTA_PHRASES,
  matchIdentityQuestion,
  mentionsVendor,
} from "../../supabase/functions/_shared/vantaVoice";
import {
  brandVoiceDirective,
  readBrandVoice,
  toneLevelFor,
  type VoiceContext,
} from "@/lib/brandVoice";
import { composeReminder } from "../../supabase/functions/_shared/reminderMessage";

describe("identity block", () => {
  it("is folded into the core voice every surface inherits", () => {
    expect(VANTA_CORE_VOICE).toContain(VANTA_IDENTITY);
    expect(VANTA_CORE_VOICE).toMatch(/Never name, confirm, deny/);
  });

  it("names the vendors only inside the ban list, never as an author", () => {
    expect(VANTA_IDENTITY).toMatch(/None of them made you/);
    for (const answer of Object.values(IDENTITY_ANSWERS)) {
      expect(mentionsVendor(answer)).toBe(false);
      expect(answer).not.toMatch(/as an AI|language model/i);
    }
  });
});

describe("identity question matching", () => {
  const cases: Array<[string, keyof typeof IDENTITY_ANSWERS]> = [
    ["who are you?", "who_are_you"],
    ["Who are you", "who_are_you"],
    ["what are you?", "who_are_you"],
    ["who made you?", "who_made_you"],
    ["who created you", "who_made_you"],
    ["who built you exactly", "who_made_you"],
    ["what model are you", "what_model"],
    ["which llm is this", "what_model"],
    ["what are you built on?", "what_model"],
    ["are you google?", "are_you_vendor"],
    ["is this gemini", "are_you_vendor"],
    ["you're running on chatgpt right", "are_you_vendor"],
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
      "who is Nikki emailing about the roster",
      "save this: gym mats arrive Friday",
    ]) {
      expect(matchIdentityQuestion(t)).toBeNull();
    }
  });
});

describe("telegram fixed copy", () => {
  it("never leaks a vendor name and never talks like a chatbot", () => {
    const tg = VANTA_PHRASES.telegram;
    const lines = [
      tg.welcome(), tg.badCode(), tg.linked(), tg.notLinked(), tg.textOnly(),
      tg.snag(), tg.help(), tg.unlinked(), tg.rateLimited(),
    ];
    for (const line of lines) {
      expect(mentionsVendor(line)).toBe(false);
      expect(line).not.toMatch(/as an AI|happy to assist|Great news|language model/i);
    }
  });

  it("keeps emoji and exclamation marks off failure copy", () => {
    for (const line of [VANTA_PHRASES.telegram.snag(), VANTA_PHRASES.telegram.badCode(), VANTA_PHRASES.telegram.rateLimited()]) {
      expect(line).not.toMatch(/!/);
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    }
  });

  it("no longer claims voice notes and documents are unreadable", () => {
    expect(VANTA_PHRASES.telegram.textOnly()).not.toMatch(/aren't readable/i);
  });

  it("answers identity questions from fixed copy", () => {
    expect(VANTA_PHRASES.telegram.identity("who_made_you")).toBe(IDENTITY_ANSWERS.who_made_you);
  });
});

describe("personality intensity model", () => {
  const full = readBrandVoice({ brand_voice: "east_coast", brand_voice_intensity: 3 });

  it("forces the calmest level on sensitive content", () => {
    expect(toneLevelFor(full, "sensitive")).toBe(1);
  });

  it("caps alerts and errors below the ceiling", () => {
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

  it("carries the ban list and context rule into the prompt", () => {
    const serious = brandVoiceDirective(full, "sensitive");
    expect(serious).toMatch(/No asides, no jokes, no emoji/);
    expect(serious).toMatch(/NEVER/);
    expect(brandVoiceDirective(full, "routine")).toMatch(/say the thing, then stop/i);
  });
});

describe("reminder openers", () => {
  it("varies the opener but never the facts", () => {
    const openers = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const { text } = composeReminder("send Nikki the roster", false, null, "Asia/Bangkok");
      expect(text).toContain("send Nikki the roster");
      openers.add(text.split("send Nikki")[0]);
    }
    expect(openers.size).toBeGreaterThan(1);
  });

  it("says late plainly when overdue, with no exclamation", () => {
    const { text } = composeReminder("pay the venue deposit", true, null, "UTC");
    expect(text).not.toMatch(/!/);
    expect(text).toContain("pay the venue deposit");
  });
});
