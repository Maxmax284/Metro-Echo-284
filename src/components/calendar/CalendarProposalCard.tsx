// The preview shown before any calendar change is approved.
//
// Shows exactly what would change, what it collides with, who else hears about
// it, which source justified it, and — while the calendar is read-only — that
// nothing has changed yet. Read-only display: it never approves or writes.
import { AlertTriangle, CalendarClock, Users } from "lucide-react";
import {
  changeLines,
  consequenceLine,
  writeCeilingLine,
  type CalendarProposal,
} from "@/lib/calendarProposal";

export function CalendarProposalCard({ proposal }: { proposal: CalendarProposal }) {
  const lines = changeLines(proposal);
  const consequence = consequenceLine(proposal);
  const ceiling = writeCeilingLine(proposal.write_state);

  return (
    <div className="mt-2 rounded-lg bg-muted/40 p-2.5 ring-1 ring-border/50">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        <CalendarClock className="h-3 w-3" />
        {proposal.event ? proposal.event.title : "New event"}
      </p>

      <ul className="mt-1.5 space-y-1">
        {lines.map((line) => (
          <li key={line} className="text-[13px] leading-snug text-foreground">
            {line}
          </li>
        ))}
      </ul>

      {proposal.conflicts.length > 0 && (
        <ul className="mt-1.5 space-y-1">
          {proposal.conflicts.map((conflict) => (
            <li key={conflict} className="flex items-start gap-1.5 text-[12px] text-warn">
              <AlertTriangle className="mt-[2px] h-3 w-3 shrink-0" />
              {conflict}
            </li>
          ))}
        </ul>
      )}

      {consequence && (
        <p className="mt-1.5 flex items-start gap-1.5 text-[12px] text-warn">
          <Users className="mt-[2px] h-3 w-3 shrink-0" />
          {consequence}
        </p>
      )}

      {proposal.source && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">From {proposal.source.note}.</p>
      )}

      {ceiling && <p className="mt-1.5 text-[11px] text-muted-foreground">{ceiling}</p>}
    </div>
  );
}
