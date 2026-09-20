import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FieldBuilt } from "@/components/origin/FieldBuilt";

describe("Metro Echo field-built origin", () => {
  it("records the real route and the everyday-companion lesson", () => {
    render(<FieldBuilt />);

    expect(screen.getByRole("heading", { name: "Built in the field. Tested against real life." })).toBeInTheDocument();
    const route = screen.getByRole("list", { name: "Field journey from Dulles to Koh Samui" });
    expect(within(route).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["IAD", "TPE", "BKK", "USM"]);
    expect(screen.getByText(/Messages, documents, calendar changes, training/)).toBeInTheDocument();
    expect(screen.getByText(/whole everyday companion through direct use/i)).toBeInTheDocument();
  });

  it("keeps immigration claims and private details bounded", () => {
    render(<FieldBuilt />);

    expect(screen.getByText(/A person at immigration helped resolve the situation/)).toBeInTheDocument();
    expect(screen.getByText(/Echo did not submit the form, inspect a government database, approve entry, or resolve immigration/)).toBeInTheDocument();
    expect(screen.getByText(/submitted/)).toBeInTheDocument();
    expect(screen.getByText(/No private address, passport detail, tenancy paper/)).toBeInTheDocument();
  });

  it("does not overclaim field proof or perfection", () => {
    render(<FieldBuilt />);

    expect(screen.getByText(/not a claim that every part of Metro Echo has been field-proven/)).toBeInTheDocument();
    expect(screen.getByText(/proactive when timing matters, quiet when it does not/)).toBeInTheDocument();
  });
});