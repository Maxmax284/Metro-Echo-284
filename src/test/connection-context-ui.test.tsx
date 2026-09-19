import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { GroundLead } from "@/components/schedule/GroundLead";
import { JourneyFitCard } from "@/components/schedule/JourneyFitCard";

describe("connecting-flight context copy", () => {
  it("names the proposed connection precisely when departure time is missing", () => {
    render(
      <JourneyFitCard
        fit={{
          plan_id: "tg637",
          flight_no: "TG637",
          kind: "needs_time",
          lead: "TG637 leaves from Taipei Taoyuan, where this trip lands. Its departure time is not on record, so Echo cannot tell a connection from an overnight.",
          detail: ["No connection duration or risk is being claimed."],
          suggest: { iata: "TPE", place: "Taipei Taoyuan", lands_at: "2026-09-20T05:40:00+08:00" },
          gap_hours: null,
        }}
      />,
    );
    expect(screen.getByText("Possible connection — departure time needed")).toBeTruthy();
    expect(screen.getByText(/cannot tell a connection from an overnight/)).toBeTruthy();
    expect(screen.queryByText(/tight/i)).toBeNull();
  });

  it("makes an airport confirmation specific to the proposed leg", () => {
    const onStage = vi.fn();
    render(
      <GroundLead
        read={{ step: "find_check_in", lead: "Check the board.", detail: [], needsCheckIn: false }}
        stage="away"
        stageLabel="I've arrived at Taipei Taoyuan (TPE)"
        onStage={onStage}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "I've arrived at Taipei Taoyuan (TPE)" }));
    expect(onStage).toHaveBeenCalledWith("airport");
    expect(screen.queryByText("Confirm I'm at the airport")).toBeNull();
  });
});