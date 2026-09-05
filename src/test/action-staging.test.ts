// One action path. These tests are the guardrail: if a surface starts building
// its own action row again, or invents a risk word the database doesn't accept,
// this file fails.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ACTION_RISKS,
  bornApproved,
  buildActionRow,
  normalizeRisk,
  normalizeStageStatus,
} from "@/lib/actionStaging";

describe("risk vocabulary", () => {
  it("only ever produces values the database accepts", () => {
    for (const word of ["low", "medium", "high", "standard", "critical", "", null, undefined, "nonsense"]) {
      expect(ACTION_RISKS).toContain(normalizeRisk(word));
    }
  });

  it("maps the old words onto real ones", () => {
    expect(normalizeRisk("medium")).toBe("standard");
    expect(normalizeRisk("low")).toBe("low_reversible");
    expect(normalizeRisk("high")).toBe("high");
  });
});

describe("the row", () => {
  it("always carries a room, even when that room is Personal", () => {
    const row = buildActionRow({ userId: "u1", title: "Send the roster", source: "ask" });
    expect(row.organization_id).toBeNull();
    expect(buildActionRow({ userId: "u1", title: "x", source: "ask", organizationId: "org-1" }).organization_id).toBe("org-1");
  });

  it("can never be born approved or executed", () => {
    expect(normalizeStageStatus("executed")).toBe("staged");
    expect(normalizeStageStatus("approved")).toBe("staged");
    expect(normalizeStageStatus("proposed")).toBe("proposed");
    expect(bornApproved(buildActionRow({ userId: "u", title: "t", source: "s" }))).toBe(false);
  });

  it("never writes an empty title", () => {
    expect(buildActionRow({ userId: "u", title: "   ", source: "s" }).title).toBe("Untitled action");
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

/** The one place allowed to insert an action row on the client. */
const CLIENT_INSERT_OWNER = "src/hooks/useStageAction.ts";
/** The one place allowed to insert an action row on the server. */
const SERVER_INSERT_OWNERS = ["supabase/functions/telegram-webhook/index.ts"];

describe("no second action path", () => {
  it("only the factory inserts into actions", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles("src"), ...sourceFiles("supabase/functions")]) {
      const text = readFileSync(file, "utf8");
      if (!/from\(["']actions["']\)\s*\n?\s*\.?\s*insert\(|from\(["']actions["']\)\.insert\(/.test(text)) continue;
      const rel = file.replace(/\\/g, "/");
      if (rel.endsWith(CLIENT_INSERT_OWNER) || SERVER_INSERT_OWNERS.some((o) => rel.endsWith(o))) {
        // Server owner must still build the row through the factory.
        if (!text.includes("buildActionRow")) offenders.push(`${rel} (hand-built row)`);
        continue;
      }
      offenders.push(rel);
    }
    expect(offenders, "route these through useStageAction / buildActionRow").toEqual([]);
  });

  it("no surface hand-writes a risk word that the database rejects", () => {
    // The integrations registry rates connectors, not actions — its own scale.
    const unrelated = ["src/lib/integrations/registry.ts"];
    const offenders: string[] = [];
    for (const file of [...sourceFiles("src"), ...sourceFiles("supabase/functions")]) {
      const rel = file.replace(/\\/g, "/");
      if (unrelated.some((u) => rel.endsWith(u))) continue;
      const text = readFileSync(file, "utf8");
      if (/risk:\s*["'](low|medium)["']/.test(text)) offenders.push(rel);
    }
    expect(offenders).toEqual([]);
  });
});
