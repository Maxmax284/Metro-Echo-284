import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AmbientHeader } from "@/components/shell/AmbientHeader";

describe("header place chip", () => {
  it("shows the place name and the freshness stamp at the same time", () => {
    render(
      <AmbientHeader
        state="ambient"
        place="Ko Samui"
        awareness={{ freshness: "missing", confidence: "medium" }}
        onAwarenessClick={() => {}}
      />,
    );
    expect(screen.getByText("Ko Samui")).toBeTruthy();
    expect(screen.getByText(/new ground · medium/)).toBeTruthy();
  });

  it("is one tap to the place board, named for the place it reads from", () => {
    const onOpen = vi.fn();
    render(
      <AmbientHeader
        state="ambient"
        place="Ko Samui"
        awareness={{ freshness: "missing", confidence: "medium" }}
        onAwarenessClick={onOpen}
      />,
    );
    const chip = screen.getByRole("button", {
      name: /Where Echo is reading from: Ko Samui — new ground, medium confidence\. Open the place board\./,
    });
    fireEvent.click(chip);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("never renders a chip without a place", () => {
    render(<AmbientHeader state="ambient" onAwarenessClick={() => {}} />);
    expect(screen.queryByRole("button", { name: /place board/ })).toBeNull();
  });
});
