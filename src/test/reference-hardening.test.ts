// The Villas/storage-unit collision, written down so it cannot come back.
// A new request must never attach itself to the newest unrelated old thing, a
// vague word must not outrank the words the user actually said, and a stale
// working pointer must not answer a fresh question.
import { describe, expect, it } from "vitest";
import {
  POINTER_TTL_MINUTES,
  askOneAtATime,
  askWhichOne,
  pointerIsFresh,
  resolveReference,
  splitRequests,
} from "../../supabase/functions/_shared/reference.ts";

const NOW = new Date("2026-09-16T15:00:00Z");
const ago = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const ROWS = [
  { id: "storage", label: "Storage unit payment", createdAt: ago(20) },
  { id: "villas", label: "Appointment at the Villas", createdAt: ago(400) },
  { id: "dentist", label: "Dentist follow-up", createdAt: ago(900) },
];

describe("the collision that started this", () => {
  it("uses the user's own words instead of the newest row", () => {
    const out = resolveReference("the villas appointment", ROWS, NOW);
    expect(out.status).toBe("one");
    expect(out.status === "one" && out.item.id).toBe("villas");
  });

  it("never lets a vague word pull the newest unrelated item when several fit", () => {
    const out = resolveReference("that reminder", ROWS, NOW);
    expect(out.status).toBe("many");
  });

  it("takes the obvious one when there is genuinely only one recent candidate", () => {
    const out = resolveReference("that", [ROWS[0]], NOW);
    expect(out.status).toBe("one");
  });

  it("refuses rather than guessing when nothing matches the words", () => {
    const out = resolveReference("the boat registration", ROWS, NOW);
    expect(out.status).toBe("none");
  });

  it("asks once, naming the choices, instead of asking repeatedly", () => {
    const asked = askWhichOne(ROWS, "reminder");
    expect(asked).toMatch(/Villas/);
    expect(asked).toMatch(/Storage unit/);
  });
});

describe("stale working pointers", () => {
  it("holds for the working window", () => {
    expect(pointerIsFresh(ago(5), POINTER_TTL_MINUTES, NOW)).toBe(true);
  });

  it("expires so an old receipt cannot answer a new question", () => {
    expect(pointerIsFresh(ago(POINTER_TTL_MINUTES + 1), POINTER_TTL_MINUTES, NOW)).toBe(false);
    expect(pointerIsFresh(null, POINTER_TTL_MINUTES, NOW)).toBe(false);
  });
});

describe("two asks in one message", () => {
  it("splits two independent requests", () => {
    const parts = splitRequests("Set a reminder for Tuesday 1pm and also file the lease under Housing");
    expect(parts.length).toBe(2);
    expect(askOneAtATime(parts)).toMatch(/one at a time|first/i);
  });

  it("leaves one situation described in two clauses alone", () => {
    expect(splitRequests("my flight lands late and training is tomorrow morning").length).toBe(1);
  });
});
