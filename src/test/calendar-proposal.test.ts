import { describe, expect, it } from "vitest";
import {
  approvalOutcomeLine,
  buildCalendarProposal,
  calendarFieldLabel,
  calendarProposalRisk,
  calendarProposalTitle,
  isCalendarProposal,
  normalizeCalendarChangeField,
  parseReminderOffsets,
  proposalSummary,
  refineCalendarProposal,
  writeCeilingLine,
  type CalendarFieldChange,
} from "@/lib/calendarProposal";
import { findConflicts, resolveEventReference, type ResolvableEvent } from "@/lib/calendarResolve";

const move = (after: string): CalendarFieldChange => ({
  field: "time",
  label: calendarFieldLabel("time"),
  before: "2:00 PM",
  after,
});

const cancel: CalendarFieldChange = { field: "existence", label: "Event", before: "Standup", after: null };

const event = { feed_id: "f1", uid: "u1", starts_at: "2026-03-02T07:00:00.000Z", ends_at: "2026-03-02T08:00:00.000Z", title: "Doctor" };

describe("calendar proposals", () => {
  it("never claims a write while the feed is read-only", () => {
    const p = buildCalendarProposal({ event, changes: [move("3:00 PM")] });
    expect(p.write_state).toBe("read_only");
    expect(writeCeilingLine(p.write_state)).toMatch(/Nothing has changed yet/);
    expect(approvalOutcomeLine(p.write_state)).toMatch(/Held/);
    expect(proposalSummary(p)).toContain("Time: 2:00 PM → 3:00 PM");
    expect(approvalOutcomeLine("connected")).toMatch(/Done/);
    expect(writeCeilingLine("connected")).toBeNull();
  });

  it("scales risk by who it reaches, not by effort", () => {
    expect(calendarProposalRisk(buildCalendarProposal({ event, changes: [move("3:00 PM")] }))).toBe("low_reversible");
    expect(calendarProposalRisk(buildCalendarProposal({ event, changes: [move("3:00 PM")], attendeeCount: 2 }))).toBe("standard");
    expect(calendarProposalRisk(buildCalendarProposal({ event, changes: [cancel] }))).toBe("standard");
    expect(calendarProposalRisk(buildCalendarProposal({ event, changes: [cancel], attendeeCount: 3 }))).toBe("high");
  });

  it("titles creation, cancellation and edits differently", () => {
    expect(calendarProposalTitle(buildCalendarProposal({ changes: [move("3:00 PM")] }))).toMatch(/^Add /);
    expect(calendarProposalTitle(buildCalendarProposal({ event, changes: [cancel] }))).toBe("Cancel Doctor");
    expect(calendarProposalTitle(buildCalendarProposal({ event, changes: [move("3:00 PM")] }))).toBe("Change time on Doctor");
  });

  it("bumps the version on refinement so an old approval cannot land", () => {
    const p = buildCalendarProposal({ event, changes: [move("3:00 PM")] });
    const refined = refineCalendarProposal(p, [move("3:30 PM")]);
    expect(refined.version).toBe(2);
    expect(refined.changes[0].after).toBe("3:30 PM");
  });

  it("recognises its own payload shape and normalises fields", () => {
    expect(isCalendarProposal(buildCalendarProposal({ event, changes: [move("3:00 PM")] }))).toBe(true);
    expect(isCalendarProposal({ kind: "note" })).toBe(false);
    expect(normalizeCalendarChangeField("LOCATION")).toBe("location");
    expect(normalizeCalendarChangeField("nonsense")).toBe("description");
  });

  it("writes every requested reminder offset to a new Google event", () => {
    const p = buildCalendarProposal({
      changes: [
        { field: "title", label: "Title", before: null, after: "Meet Dani" },
        { field: "time", label: "Time", before: null, after: "2026-09-15T22:00:00.000Z" },
        { field: "reminder", label: "Reminder", before: null, after: "1440,60" },
      ],
      writeState: "connected",
    });
    expect(p.changes[2].after).toBe("1440,60");
    expect(parseReminderOffsets(p.changes[2].after)).toEqual([1440, 60]);
  });
});

describe("resolving what the user meant", () => {
  const events: ResolvableEvent[] = [
    { feed_id: "f1", uid: "u1", starts_at: "2026-03-02T07:00:00.000Z", ends_at: "2026-03-02T08:00:00.000Z", title: "Doctor appointment" },
    { feed_id: "f1", uid: "u2", starts_at: "2026-03-02T07:30:00.000Z", ends_at: "2026-03-02T08:30:00.000Z", title: "Standup" },
    { feed_id: "f1", uid: "u3", starts_at: "2026-03-05T02:00:00.000Z", ends_at: null, title: "Doctor follow-up" },
  ];

  it("finds one, none, or asks which", () => {
    expect(resolveEventReference("standup", events).status).toBe("one");
    expect(resolveEventReference("dentist", events).status).toBe("none");
    expect(resolveEventReference("doctor", events).status).toBe("many");
  });

  it("only reports real collisions, excluding the event being moved", () => {
    expect(findConflicts("2026-03-02T07:15:00.000Z", null, events, "u1")).toHaveLength(1);
    expect(findConflicts("2026-03-02T20:00:00.000Z", null, events, "u1")).toHaveLength(0);
  });
});

// Talking a proposal into shape must adjust the one on the table, not spawn a
// second one — the same law Telegram already follows.
describe("refining by conversation", () => {
  const base = buildCalendarProposal({
    event: { feed_id: "f1", uid: "u1", starts_at: "2026-09-15T14:00:00.000Z", ends_at: null, title: "Dentist" },
    changes: [{ field: "time", label: "Time", before: "Tue 2:00 PM", after: "2026-09-17T14:00:00.000Z" }],
    attendeeCount: 0,
    source: null,
    conflicts: [],
    writeState: "connected",
  });

  it("keeps the same event and bumps the version", () => {
    const refined = refineCalendarProposal(base, [
      { field: "time", label: "Time", before: "Tue 2:00 PM", after: "2026-09-17T15:30:00.000Z" },
    ]);
    expect(refined.version).toBe(base.version + 1);
    expect(refined.event?.uid).toBe("u1");
    expect(refined.changes[0].after).toContain("15:30");
    expect(isCalendarProposal(refined)).toBe(true);
  });

  it("still stages nothing on the provider", () => {
    const refined = refineCalendarProposal(base, [{ field: "location", label: "Location", before: null, after: "Old Town" }]);
    expect(refined.kind).toBe("calendar_change");
    expect(proposalSummary(refined)).toContain("Old Town");
  });
});
