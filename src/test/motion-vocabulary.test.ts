// One motion vocabulary — a guard, not a style opinion.
//
// Movement in Metro Echo has to mean something, so durations and entrances are
// named in src/lib/motion.ts. This test fails if app code reintroduces a raw
// Tailwind duration or the old `animate-fade-in`, both of which ignore the Feel
// knob and reduced-motion. shadcn primitives under components/ui are exempt.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MOTION_FADE } from "@/lib/motion";

const ROOT = join(process.cwd(), "src");
const EXEMPT = [join("components", "ui")];

function appFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "test") continue;
      appFiles(full, out);
    } else if (full.endsWith(".tsx")) {
      if (!EXEMPT.some((e) => full.includes(e))) out.push(full);
    }
  }
  return out;
}

describe("motion vocabulary", () => {
  const files = appFiles(ROOT);

  it("finds app components to check", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("has no raw Tailwind durations outside the ui primitives", () => {
    const offenders = files.filter((f) =>
      /duration-(75|100|150|200|300|500|700|1000)\b/.test(readFileSync(f, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("has no legacy animate-fade-in", () => {
    const offenders = files.filter((f) => /animate-fade-in/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("names the one fade", () => {
    expect(MOTION_FADE).toBe("motion-fade");
  });
});
