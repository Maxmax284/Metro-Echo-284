// One depth model, one urgency ladder. If a surface invents a fourth
// vocabulary for "how much do I say" or "how much does this matter",
// this file fails.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  BODY_DEPTH,
  VERBOSITY_FOR_BODY,
  bodyForChannel,
  bodyForDevice,
  verbosityForBody,
  type VantaBody,
} from "@/lib/responseDepth";
import { formsAgree, renderBody, renderForms, URGENCY_LABEL } from "@/lib/deviceCompression";
import { URGENCY_ORDER } from "@/lib/awareness";

const BODIES: VantaBody[] = ["desk", "phone", "telegram", "wrist", "spoken"];

describe("one depth model", () => {
  it("every body has a depth spec and exactly one verbosity", () => {
    for (const b of BODIES) {
      expect(BODY_DEPTH[b]).toBeTruthy();
      expect(VERBOSITY_FOR_BODY[b]).toBeTruthy();
      expect(verbosityForBody(b)).toBe(VERBOSITY_FOR_BODY[b]);
    }
  });

  it("channels and devices resolve to a body, never to a verbosity", () => {
    expect(bodyForChannel("messaging")).toBe("telegram");
    expect(bodyForChannel("wearable")).toBe("wrist");
    expect(bodyForChannel("voice")).toBe("spoken");
    expect(bodyForChannel("nonsense")).toBe("desk");
    expect(bodyForDevice("wearable")).toBe("wrist");
  });

  it("smaller bodies never say more than the desk", () => {
    const facts = {
      title: "Nikki's schedule is still unsent",
      why: "You promised it Monday and nothing has gone out",
      lines: ["Due 6pm today", "Last touched Friday"],
      nextStepLine: "Send it or push the date.",
    };
    const forms = renderForms(facts, "time_sensitive");
    expect(formsAgree(forms)).toBe(true);
    expect(forms.desk.length).toBeGreaterThanOrEqual(forms.telegram.length);
    expect(forms.telegram.length).toBeGreaterThanOrEqual(forms.wrist.length);
    for (const b of BODIES) expect(renderBody(facts, b)).toContain("schedule");
  });

  it("urgency has one ladder with plain-English labels", () => {
    for (const u of URGENCY_ORDER) {
      expect(URGENCY_LABEL[u]).toBeTruthy();
      expect(URGENCY_LABEL[u]).not.toMatch(/_/);
    }
  });
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe("no fourth vocabulary", () => {
  it("the retired urgency words are gone from source", () => {
    const offenders: string[] = [];
    for (const file of [...sourceFiles("src"), ...sourceFiles("supabase/functions")]) {
      const text = readFileSync(file, "utf8");
      if (/["'](fyi|meaningful)["']/.test(text)) offenders.push(file.replace(/\\/g, "/"));
    }
    expect(offenders).toEqual([]);
  });
});
