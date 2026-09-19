// terminalPath — the walk through a terminal, in the order a person walks it.
//
// Doctrine:
//   - No geometry. Echo has no floor plan for any airport, so it draws the
//     ORDER of the stops and what is on record at each one — never a map that
//     implies it knows where a desk physically sits.
//   - A stop with nothing filed says so plainly and then says who does know.
//   - Derived from the ground read; nothing stored, nothing ticked off.
//
// Pure module: no IO, no React.

import type { GroundStep } from "./groundPath";

export type TerminalStop = {
  key: "check_in" | "bag_drop" | "security" | "gate" | "baggage" | "exit";
  label: string;
  /** What is on record at this stop, or plainly that nothing is. */
  where: string;
  state: "done" | "now" | "ahead";
};

const DEPART_ORDER: TerminalStop["key"][] = ["check_in", "bag_drop", "security", "gate"];

/** Where the walk stands, as an index into the departure stops. */
function stepIndex(step: GroundStep | null | undefined): number {
  switch (step) {
    case "find_check_in":
      return 0;
    case "through_security":
      return 2;
    case "gate_pending":
    case "gate_posted":
      return 3;
    case "boarding":
      return 3;
    default:
      return -1;
  }
}

export type TerminalPathInput = {
  step: GroundStep | null | undefined;
  /** The airline whose desks you look for — the one that flies the aircraft. */
  carrier: string | null;
  /** Check-in zone or counter, only when a source stated it. */
  zone: string | null;
  terminal: string | null;
  gate: string | null;
  /** The airport in words, for the stops that name a building. */
  place: string | null;
  /** True once the flight is in the air or down: the arrival walk, not the departure one. */
  arrivalSide?: boolean;
};

export function terminalPath(input: TerminalPathInput): TerminalStop[] {
  const clean = (v: string | null | undefined) => {
    const t = (v ?? "").trim();
    return t ? t : null;
  };
  const carrier = clean(input.carrier);
  const zone = clean(input.zone);
  const term = clean(input.terminal);
  const gate = clean(input.gate);
  const place = clean(input.place);
  const termWords = term ? `Terminal ${term.replace(/^T(?=\w)/i, "")}` : null;

  if (input.arrivalSide) {
    return [
      {
        key: "gate",
        label: "Off the aircraft",
        where: gate
          ? `Arrival gate ${gate}${termWords ? `, ${termWords}` : ""}.`
          : "Arrival gate is not filed — follow the crew and the signs off the aircraft.",
        state: "done",
      },
      {
        key: "baggage",
        label: "Baggage claim",
        where: "The belt number is not on record — the arrivals screens name it after immigration.",
        state: "now",
      },
      {
        key: "exit",
        label: "Way out",
        where: place ? `Customs, then the arrivals hall at ${place}.` : "Customs, then the arrivals hall.",
        state: "ahead",
      },
    ];
  }

  const at = stepIndex(input.step);
  const state = (i: number): TerminalStop["state"] => (at < 0 ? "ahead" : i < at ? "done" : i === at ? "now" : "ahead");

  const stops: Record<TerminalStop["key"], TerminalStop> = {
    check_in: {
      key: "check_in",
      label: "Check-in desks",
      where: zone
        ? `${carrier ?? "The operating airline"} — ${zone}${termWords ? `, ${termWords}` : ""}.`
        : `${carrier ?? "The operating airline"}'s desks${termWords ? ` in ${termWords}` : ""}${
            place ? ` at ${place}` : ""
          } — no zone or counter is on record, so Echo will not name one.`,
      state: state(0),
    },
    bag_drop: {
      key: "bag_drop",
      label: "Bag drop",
      where: "At or beside the same desks. Hand luggage only means you can walk straight past it.",
      state: state(1),
    },
    security: {
      key: "security",
      label: "Security",
      where: termWords
        ? `After the desks, inside ${termWords}. No honest queue time is on record.`
        : "After the desks. No honest queue time is on record.",
      state: state(2),
    },
    gate: {
      key: "gate",
      label: "Gate",
      where: gate
        ? `Gate ${gate}${termWords ? `, ${termWords}` : ""}, airside.`
        : "Airside, gate not posted yet — the departures board posts it first.",
      state: state(3),
    },
    baggage: { key: "baggage", label: "Baggage claim", where: "", state: "ahead" },
    exit: { key: "exit", label: "Way out", where: "", state: "ahead" },
  };

  return DEPART_ORDER.map((k) => stops[k]);
}
