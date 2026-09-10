// TasksLane — your promises as a checklist, in the same room as the day.
//
// This is not a second task system. Every row is an existing commitment; the
// checkbox is the same Done path with the same preview and the same receipt.
// A promise without a date says "no date yet" rather than borrowing today's.
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { CommitmentActions } from "@/components/commitments/CommitmentActions";
import { MachineText } from "@/components/ui/instrument";
import { LEAD_BAR } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type TaskRow = {
  id: string;
  summary: string;
  due_at: string | null;
};

function dueLine(due: string | null): { text: string; late: boolean } {
  if (!due) return { text: "no date yet", late: false };
  const d = new Date(due);
  if (isToday(d)) return { text: `due today, ${format(d, "HH:mm")}`, late: isPast(d) };
  if (isTomorrow(d)) return { text: "due tomorrow", late: false };
  if (isPast(d)) return { text: `overdue since ${format(d, "d MMM")}`, late: true };
  return { text: `due ${format(d, "EEE d MMM")}`, late: false };
}

export function TasksLane({
  tasks,
  onChanged,
}: {
  tasks: TaskRow[];
  onChanged: () => void;
}) {
  if (tasks.length === 0) return null;
  return (
    <section className="vanta-card space-y-1.5 px-3 py-3">
      <p className="text-[12.5px] font-medium leading-snug text-foreground">
        <MachineText>{tasks.length}</MachineText>{" "}
        {tasks.length === 1 ? "promise is open" : "promises are open"}
      </p>
      <ul className="space-y-1.5">
        {tasks.slice(0, 8).map((t) => {
          const due = dueLine(t.due_at);
          return (
            <li
              key={t.id}
              data-echo-row
              className={cn(
                "vanta-inset flex items-center gap-2 px-3 py-2",
                LEAD_BAR,
                due.late ? "text-warn" : "text-primary/25",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-foreground/90">{t.summary}</p>
                <p
                  className={cn(
                    "mt-0.5 text-[10.5px] leading-snug",
                    due.late ? "text-warn" : "text-muted-foreground",
                  )}
                >
                  {due.text}
                </p>
              </div>
              <CommitmentActions
                c={{ id: t.id, title: t.summary, due_at: t.due_at, remind_at: null, status: "open" }}
                size="sm"
                onChanged={onChanged}
              />
            </li>
          );
        })}
      </ul>
      <p className="text-[10.5px] leading-snug text-muted-foreground/80">
        Closing one here is the same close as in Commitments — you get the preview first, and it leaves a receipt.
      </p>
    </section>
  );
}
