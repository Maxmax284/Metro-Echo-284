import { describe, expect, it } from "vitest";
import {
  TELEGRAM_COMMANDS,
  matchHelpQuestion,
  renderTelegramGuideMarkdown,
  renderTelegramHelp,
} from "../../supabase/functions/_shared/telegram_guide";

describe("telegram guide", () => {
  it("hears the ways people actually ask how to use it", () => {
    for (const q of [
      "how do I use you",
      "what can you do?",
      "/help",
      "help",
      "what can't you do",
      "how does this work",
    ]) {
      expect(matchHelpQuestion(q), q).toBe(true);
    }
  });

  it("does not swallow real work", () => {
    for (const q of [
      "help me move my 2pm to 4pm",
      "what's on my calendar tomorrow",
      "remind me to call the landlord",
      "",
    ]) {
      expect(matchHelpQuestion(q), q).toBe(false);
    }
  });

  it("names every shortcut the bot handles and stays honest about writes", () => {
    const help = renderTelegramHelp();
    for (const c of TELEGRAM_COMMANDS) expect(help).toContain(c.cmd);
    expect(help).toContain("without your yes");
    expect(help).toContain("Reading never stages");
  });

  it("writes a saveable copy that names the bot", () => {
    const md = renderTelegramGuideMarkdown("Glitch284_bot");
    expect(md).toContain("# Echo on Telegram");
    expect(md).toContain("@Glitch284_bot");
    expect(md).toContain("Capture never executes.");
  });
});
