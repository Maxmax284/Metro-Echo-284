// One Echo, one answer about pictures. These tests exist because the chat once
// looked at a photo and, one message earlier, claimed it was blind.
import { describe, expect, it } from "vitest";
import { MEDIA_CAPABILITY, VANTA_PHRASES } from "../../supabase/functions/_shared/vantaVoice";
import { afterLookLine, LOOK_INTENTS } from "../../supabase/functions/_shared/lookAt";
import { renderTelegramHelp, TELEGRAM_GUIDE } from "../../supabase/functions/_shared/telegram_guide";

describe("media capability contract", () => {
  it("states plainly that images can be seen", () => {
    expect(MEDIA_CAPABILITY).toMatch(/CAN see and understand images/);
    expect(MEDIA_CAPABILITY.toLowerCase()).toContain("screenshot");
  });

  it("forbids the blanket denial and the tool excuse", () => {
    expect(MEDIA_CAPABILITY).toMatch(/never say you cannot see or analyse images/i);
    expect(MEDIA_CAPABILITY).toMatch(/no tool for it/i);
  });

  it("keeps the real limits narrow and named", () => {
    expect(MEDIA_CAPABILITY.toLowerCase()).toContain("video");
    expect(MEDIA_CAPABILITY.toLowerCase()).toContain("too large");
  });

  it("bans lawyering an obvious recognition", () => {
    expect(MEDIA_CAPABILITY).toMatch(/appears to be/);
    expect(MEDIA_CAPABILITY).toMatch(/resembling/);
    for (const intent of LOOK_INTENTS) {
      expect(intent.prompt.length).toBeGreaterThan(20);
    }
  });

  it("keeps capture safe: saving happens, filing is asked", () => {
    for (const id of LOOK_INTENTS.map((i) => i.id)) {
      const line = afterLookLine(id);
      expect(line).toContain("Inbox");
      expect(line.endsWith("?")).toBe(true);
      expect((line.match(/\?/g) ?? []).length).toBe(1);
    }
  });
});

describe("help copy tells the truth about media", () => {
  const help = renderTelegramHelp();

  it("says photos are looked at, not just scraped for text", () => {
    expect(help.toLowerCase()).toContain("photo");
    expect(help.toLowerCase()).toContain("screenshot");
  });

  it("names what it cannot read instead of denying images", () => {
    expect(help.toLowerCase()).toContain("video");
    expect(help.toLowerCase()).not.toContain("can't look at photos");
  });

  it("promises image understanding in the shared guide", () => {
    const can = TELEGRAM_GUIDE.find((s) => s.title === "What it can do")?.lines.join(" ") ?? "";
    expect(can.toLowerCase()).toContain("look at photos");
  });

  it("keeps the paired and unreadable lines media-honest", () => {
    expect(VANTA_PHRASES.telegram.textOnly().toLowerCase()).toContain("screenshot");
  });
});
