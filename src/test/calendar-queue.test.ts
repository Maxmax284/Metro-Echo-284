import { describe, it, expect } from "vitest";
import { buildCalendarQueue } from "../../supabase/functions/_shared/calendarQueue";
import { buildCalendarProposal } from "../../supabase/functions/_shared/calendarProposal";

function proposal(after: string) {
  return buildCalendarProposal({
    event: null,
    changes: [{ field: "existence", label: "On the calendar", before: null, after }],
    attendeeCount: 0,
    source: null,
    conflicts: [],
    writeState: "connected",
  });
}

describe("calendar queue panel", () => {
  it("says nothing is in flight when there are no calendar edits", () => {
    const q = buildCalendarQueue([{ id: "1", status: "staged", payload: { kind: "other" } }]);
    expect(q.retryIds).toEqual([]);
    expect(q.text).toMatch(/No calendar edits in flight/);
  });

  it("groups queued, approved and written edits and only offers retry on approved", () => {
    const q = buildCalendarQueue([
      { id: "a", status: "staged", payload: proposal("Dentist") },
      { id: "b", status: "approved", payload: proposal("Dani at One Loudoun") },
      { id: "c", status: "executed", payload: proposal("Wingate checkout") },
    ]);
    expect(q.retryIds).toEqual(["b"]);
    expect(q.text).toMatch(/Waiting on your yes:/);
    expect(q.text).toMatch(/Approved, not written to Google yet:/);
    expect(q.text).toMatch(/Written to Google:/);
    expect(q.text).toMatch(/Retry write/);
  });
});
