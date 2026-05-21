// Guardrail: forbid direct `sonner` imports outside the wrapper + Toaster.
// If this test fails, route the call through @/lib/vantaVoice (vantaToast/vantaSay)
// instead of importing `toast` from sonner directly.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ALLOW = new Set([
  "src/components/ui/sonner.tsx", // Toaster renderer
  "src/lib/vantaVoice.ts",        // the wrapper itself
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe("vantaVoice guardrail", () => {
  it("no direct sonner imports outside the wrapper", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const rel = file.replace(/\\/g, "/");
      if (ALLOW.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (/from\s+["']sonner["']/.test(src)) offenders.push(rel);
    }
    expect(offenders, `Use vantaToast/vantaSay from @/lib/vantaVoice instead.\nOffenders:\n${offenders.join("\n")}`)
      .toEqual([]);
  });

  it("no forbidden chatbot phrases in component copy", () => {
    // Skip the voice library and this test — they mention the phrases legitimately to forbid them.
    const SKIP = new Set([
      "src/lib/vantaVoice.ts",
      "src/test/voice-guardrail.test.ts",
    ]);
    const FORBIDDEN = [
      /how can i help you today/i,
      /how may i assist/i,
      /as an ai (assistant|language model)/i,
      /i'?d be happy to/i,
      /\bcertainly!/i,
      /unlock your productivity/i,
      /optimize your workflow/i,
      /great job staying organized/i,
      /your productivity journey/i,
      /something went wrong/i,
    ];
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const rel = file.replace(/\\/g, "/");
      if (SKIP.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(src)) offenders.push(`${rel}  ::  ${re}`);
      }
    }
    expect(offenders, `Route copy through vantaSay.* instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
