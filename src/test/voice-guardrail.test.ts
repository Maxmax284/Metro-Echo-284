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
});
