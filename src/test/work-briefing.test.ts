import { describe, expect, it } from "vitest";
import {
  buildWorkBriefing,
  buildSections,
  startHere,
  LANE_LIMIT,
  type BriefingInput,
} from "@/lib/workBriefing";

const NOW = Date.parse("2026-08-29T10:00:00Z");
const empty: BriefingInput = { needsYou: [], arrived: [], due: [], drifting: [] };

const action = (id: string) => ({ id, label: `Action ${id}`, surface: "actions" as const });
const capture = (id: string) => ({ id, label: `Capture ${id}`, surface: "inbox" as const });
const due = (id: string, dueAt: string) => ({
  id,
  label: `Promise ${id}`,
  surface: "commitments" as const,
  dueAt,
});
const project = (id: string, lastAt: string) => ({
  id,
  label: `Project ${id}`,
  surface: "projects" as const,
  lastAt,
  href: `/projects/${id}`,
});

describe("work briefing", () => {
  it("stays calm when nothing has a claim", () => {
    const b = buildWorkBriefing(empty, NOW);
    expect(b.calm).toBe(true);
    expect(b.sections).toHaveLength(0);
    expect(b.start).toBeNull();
  });

  it("promotes exactly one start-here item", () => {
    const b = buildWorkBriefing(
      { ...empty, needsYou: [action("a"), action("b")], arrived: [capture("c")] },
      NOW,
    );
    expect(b.start?.lane).toBe("needs-you");
    expect(b.start?.line).toBe("Start here: 2 approvals are waiting.");
  });

  it("ranks approvals above overdue promises above arrivals", () => {
    const overdue = due("x", "2026-08-20T10:00:00Z");
    expect(startHere({ ...empty, needsYou: [action("a")], due: [overdue] }, NOW)?.lane).toBe("needs-you");
    expect(startHere({ ...empty, due: [overdue], arrived: [capture("c")] }, NOW)?.lane).toBe("due");
    expect(startHere({ ...empty, arrived: [capture("c")] }, NOW)?.lane).toBe("arrived");
  });

  it("falls back to the nearest date, then to the quietest project", () => {
    const soon = startHere({ ...empty, due: [due("x", "2026-09-01T10:00:00Z")] }, NOW);
    expect(soon?.line).toContain("is next up");

    const quiet = startHere({ ...empty, drifting: [project("p", "2026-08-17T10:00:00Z")] }, NOW);
    expect(quiet?.line).toBe("Start here: Project p has been quiet for 12 days.");
  });

  it("caps each lane and keeps the true total", () => {
    const sections = buildSections(
      { ...empty, arrived: [capture("1"), capture("2"), capture("3"), capture("4")] },
      NOW,
    );
    expect(sections[0].items).toHaveLength(LANE_LIMIT);
    expect(sections[0].total).toBe(4);
  });

  it("orders due by date and drifting by quietest first", () => {
    const sections = buildSections(
      {
        ...empty,
        due: [due("late", "2026-09-05T10:00:00Z"), due("soon", "2026-08-30T10:00:00Z")],
        drifting: [project("fresh", "2026-08-25T10:00:00Z"), project("old", "2026-07-01T10:00:00Z")],
      },
      NOW,
    );
    const dueLane = sections.find((s) => s.lane === "due")!;
    const drift = sections.find((s) => s.lane === "drifting")!;
    expect(dueLane.items[0].id).toBe("soon");
    expect(drift.items[0].id).toBe("old");
  });

  it("never emits a lane with no records", () => {
    const sections = buildSections({ ...empty, needsYou: [action("a")] }, NOW);
    expect(sections.map((s) => s.lane)).toEqual(["needs-you"]);
  });
});
