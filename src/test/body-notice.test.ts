import { describe, expect, it } from "vitest";
import { bodyNews } from "../../supabase/functions/_shared/bodyNotice";

const now = new Date("2026-09-18T12:00:00Z");

/** One value per day, counting back from `now`. */
function days(kind: string, values: number[], startDaysAgo: number) {
  return values.map((value, i) => ({
    kind,
    value,
    measured_at: new Date(now.getTime() - (startDaysAgo - i) * 86_400_000).toISOString(),
  }));
}

describe("bodyNews", () => {
  it("says nothing when a reading arrives but nothing moved", () => {
    const rows = [...days("sleep", [420, 425, 418, 422, 421, 419], 6), ...days("sleep", [420], 0)];
    expect(bodyNews(rows, ["sleep"], { now })).toBeNull();
  });

  it("says nothing when there is no usual yet", () => {
    const rows = days("heart_rate", [58, 74], 1);
    expect(bodyNews(rows, ["heart_rate"], { now })).toBeNull();
  });

  it("speaks when sleep ran well under this person's own usual", () => {
    const rows = [...days("sleep", [480, 470, 475, 465, 472], 8), ...days("sleep", [300, 290], 1)];
    const news = bodyNews(rows, ["sleep"], { now });
    expect(news?.kinds).toEqual(["sleep"]);
    expect(news?.title).toBe("Your sleep moved");
    expect(news?.body).toContain("slept less");
    expect(news?.body).toContain("Echo does not read them as a diagnosis");
  });

  it("ignores kinds that did not arrive", () => {
    const rows = [...days("sleep", [480, 470, 475, 465, 472], 8), ...days("sleep", [300, 290], 1)];
    expect(bodyNews(rows, ["steps"], { now })).toBeNull();
  });

  it("keys one note per day per set of moved kinds", () => {
    const rows = [
      ...days("sleep", [480, 470, 475, 465, 472], 8),
      ...days("sleep", [300, 290], 1),
      ...days("heart_rate", [55, 54, 56, 55], 8),
      ...days("heart_rate", [70, 71], 1),
    ];
    const news = bodyNews(rows, ["sleep", "heart_rate"], { now });
    expect(news?.dedupeKey).toBe("body_moved:2026-09-18:heart_rate+sleep");
    expect(news?.title).toBe("Your readings moved");
  });
});
