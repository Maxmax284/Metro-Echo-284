// SurfaceAftermath — the room-level version of the aftermath contract.
//
// Cards say what happens if you tap them. A whole desk should also say where
// its records go next, so no page ever ends in a dead end. This is copy only:
// it never reads state, never executes, never invents a destination.
import { AftermathHint } from "./AftermathHint";
import { cn } from "@/lib/utils";

export type AftermathSurfaceKey =
  | "commitments"
  | "actions"
  | "memory"
  | "projects"
  | "schedule"
  | "briefs"
  | "audit"
  | "awareness"
  | "sherlock"
  | "inbox";

const LINE: Record<AftermathSurfaceKey, string> = {
  commitments:
    "Closing a promise stamps it here and writes a receipt · overdue ones surface in Today",
  actions:
    "Nothing here runs until you approve it · every approval and result lands in Receipts",
  memory:
    "Notes stay searchable and can be attached to a project · Sherlock reads them for patterns",
  projects:
    "A project collects the notes, promises and actions you attach · its brief reads off them",
  schedule:
    "Calendars are read-only here · changes show as a diff, and Vanta never writes back",
  briefs:
    "A brief is built from your own records · exports appear in Receipts with what went into them",
  audit: "This is the evidence layer · nothing here can be edited, only read and annotated",
  awareness:
    "A notice is a draft observation · acting on one opens the real desk, it never executes here",
  sherlock:
    "Findings are suggestions until you accept them · accepting files the link and writes a receipt",
  inbox:
    "Everything here waits as a draft · routing it makes it a note, a promise or an action",
};

export function SurfaceAftermath({
  surface,
  className,
}: {
  surface: AftermathSurfaceKey;
  className?: string;
}) {
  return <AftermathHint text={LINE[surface]} className={cn("mt-3", className)} />;
}
