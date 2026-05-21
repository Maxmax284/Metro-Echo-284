// Guardrail: forbid direct `sonner` imports outside the wrapper + Toaster,
// and forbid the generic chatbot/productivity copy that violates the Vanta
// Default Operator Voice. Route all user-facing copy through vantaSay.*.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SONNER_ALLOW = new Set([
  "src/components/ui/sonner.tsx", // Toaster renderer
  "src/lib/vantaVoice.ts",        // the wrapper itself
]);

// Files allowed to mention banned phrases because they exist to *forbid* them
// (voice rule libraries, prompt instructions, and this test itself).
const VOICE_ALLOW = new Set([
  "src/lib/vantaVoice.ts",
  "src/test/voice-guardrail.test.ts",
  "supabase/functions/_shared/vantaVoice.ts",
  "supabase/functions/vanta-converse/index.ts",
  "supabase/functions/telegram-webhook/index.ts",
  "supabase/functions/briefing-compose/index.ts",
  "supabase/functions/notes-assist/index.ts",
  "supabase/functions/sherlock-investigate/index.ts",
]);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

// Forbidden phrases from the Vanta voice spec. These are the strings the
// platform must *never* ship in user-facing copy.
const FORBIDDEN: RegExp[] = [
  /how can i help you today/i,
  /how may i assist/i,
  /as an ai (assistant|language model)/i,
  /i apologi[sz]e/i,
  /i'?d be happy to/i,
  /\bcertainly!/i,
  /unlock your productivity/i,
  /optimi[sz]e your workflow/i,
  /great job staying organized/i,
  /your productivity journey/i,
  /something went wrong/i,
  /let'?s get organi[sz]ed/i,
  /seamless experience/i,
  /boost your workflow/i,
];

describe("vantaVoice guardrail", () => {
  it("no direct sonner imports outside the wrapper", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const rel = file.replace(/\\/g, "/");
      if (SONNER_ALLOW.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      if (/from\s+["']sonner["']/.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      `Use vantaToast/vantaSay from @/lib/vantaVoice instead.\nOffenders:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("no forbidden chatbot phrases in src/", () => {
    const offenders: string[] = [];
    for (const file of walk("src")) {
      const rel = file.replace(/\\/g, "/");
      if (VOICE_ALLOW.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(src)) offenders.push(`${rel}  ::  ${re}`);
      }
    }
    expect(
      offenders,
      `Route copy through vantaSay.* instead:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("no forbidden chatbot phrases in supabase/functions/", () => {
    const offenders: string[] = [];
    for (const file of walk("supabase/functions")) {
      const rel = file.replace(/\\/g, "/");
      if (VOICE_ALLOW.has(rel)) continue;
      const src = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(src)) offenders.push(`${rel}  ::  ${re}`);
      }
    }
    expect(
      offenders,
      `Edge-function copy must use vantaSay phrases too:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
