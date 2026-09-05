import { describe, expect, it } from "vitest";
import { DESK_TEACHING, DRAFT_KINDS, DRAFT_ORIGIN } from "@/lib/deskTeaching";
import { DESK_ROLES, type DeskKey } from "@/lib/deskRoles";

const KEYS = Object.keys(DESK_ROLES) as DeskKey[];

/** Words that would imply Echo acts on its own. None may appear in copy. */
const AUTONOMY_WORDS = [
  "automatically",
  "auto-send",
  "on its own",
  "we will send",
  "sends it",
  "books it",
  "pays",
];

describe("desk teaching", () => {
  it("covers every desk", () => {
    for (const k of KEYS) expect(DESK_TEACHING[k], k).toBeTruthy();
    expect(Object.keys(DESK_TEACHING).sort()).toEqual(KEYS.sort());
  });

  it("gives every desk a job, taps, a next line and an example", () => {
    for (const k of KEYS) {
      const t = DESK_TEACHING[k];
      expect(t.does.length, `${k} does`).toBeGreaterThan(10);
      expect(t.doThis.length, `${k} doThis`).toBeGreaterThanOrEqual(2);
      expect(t.doThis.length, `${k} doThis`).toBeLessThanOrEqual(5);
      expect(t.doThis, `${k} recommended`).toContain(t.recommended);
      expect(t.next.length, `${k} next`).toBeGreaterThan(10);
      expect(t.example.title.length, `${k} example`).toBeGreaterThan(3);
      expect(t.example.caption.length, `${k} caption`).toBeGreaterThan(10);
      expect(t.example.lines.length, `${k} example lines`).toBeGreaterThan(0);
    }
  });

  it("never promises autonomy anywhere in desk copy", () => {
    for (const k of KEYS) {
      const t = DESK_TEACHING[k];
      const blob = [
        t.does,
        t.next,
        ...t.doThis,
        ...t.assists.flatMap((a) => [a.label, a.note]),
        t.example.caption,
        ...t.example.lines,
      ]
        .join(" ")
        .toLowerCase();
      for (const w of AUTONOMY_WORDS) {
        expect(blob, `${k} must not say "${w}"`).not.toContain(w);
      }
    }
  });

  it("labels every assist as something that only prepares", () => {
    for (const k of KEYS) {
      for (const a of DESK_TEACHING[k].assists) {
        expect(a.note.length, `${k} · ${a.label}`).toBeGreaterThan(15);
      }
    }
  });

  it("explains the draft loop in three steps ending in approval", () => {
    expect(DRAFT_ORIGIN).toHaveLength(3);
    expect(DRAFT_ORIGIN[2].step.toLowerCase()).toContain("approve");
    expect(DRAFT_KINDS.length).toBeGreaterThan(2);
  });
});
