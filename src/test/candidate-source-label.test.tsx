// A candidate card says where its record came from, in the same words the flight
// card uses. No source recorded means no label invented.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { JourneyFitCard } from "@/components/schedule/JourneyFitCard";
import type { JourneyFit } from "@/lib/journeyFit";

const fit: JourneyFit = {
  plan_id: "p1",
  kind: "needs_time",
  lead: "TG637 could be your next leg out of Taipei.",
  detail: ["No departure time is on record."],
  suggest: null,
} as JourneyFit;

describe("candidate card provenance", () => {
  it("shows the mail it was read from", () => {
    render(<JourneyFitCard fit={fit} source="Read from a mail Echo read, sent by EVA Air." />);
    expect(screen.getByText(/Read from a mail Echo read, sent by EVA Air\./)).toBeInTheDocument();
  });

  it("says nothing when no source is known", () => {
    render(<JourneyFitCard fit={fit} />);
    expect(screen.queryByText(/Read from/)).toBeNull();
  });
});
