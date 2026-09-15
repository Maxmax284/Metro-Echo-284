// DaySimulator — four kinds of day, four different Echoes. The quiet day is
// actually quiet; that is the point of including it.
import { useState } from "react";
import { cn } from "@/lib/utils";

type Day = {
  id: string;
  label: string;
  incoming: string[];
  echo: string[];
  note: string;
};

const DAYS: Day[] = [
  {
    id: "travel",
    label: "Travel day",
    incoming: ["Gate change", "Host message", "New city, no idea where anything is", "Clock jumped 7 hours"],
    echo: [
      "Your flight boards from a different gate; you still have 50 minutes.",
      "Nearest pharmacy to tonight's place is 400 m, open until 22:00. Local non-emergency line saved.",
    ],
    note: "Local context, transport, timing. Not a travel brochure.",
  },
  {
    id: "training",
    label: "Training day",
    incoming: ["Two messages", "One invoice", "Session ran long", "Heart rate still elevated"],
    echo: [
      "Nothing needed you during training. Two messages waited; neither was urgent.",
      "You slept less, trained harder, and had more caffeine than usual today.",
    ],
    note: "Interruptions get delayed on purpose. Body context is observation, never diagnosis.",
  },
  {
    id: "chaos",
    label: "Work chaos",
    incoming: ["Payment retry failed", "Client asking for the contract", "Two calendar collisions", "New file dropped"],
    echo: [
      "Two things need you: approve the refund note and pick which 3:00 you're keeping.",
      "The contract reply is drafted and waiting on your approval.",
    ],
    note: "Nine incoming items, two decisions. Everything else is staged or can wait.",
  },
  {
    id: "quiet",
    label: "Quiet day",
    incoming: [],
    echo: ["Nothing needs you right now."],
    note: "That counts as intelligence too.",
  },
];

export function DaySimulator() {
  const [id, setId] = useState("chaos");
  const day = DAYS.find((d) => d.id === id)!;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kinds of day">
        {DAYS.map((d) => (
          <button
            key={d.id}
            role="tab"
            aria-selected={d.id === id}
            onClick={() => setId(d.id)}
            className={cn(
              "min-h-9 rounded-full border px-3 text-[12px] font-medium transition-colors",
              d.id === id
                ? "border-primary/60 bg-primary/15 text-foreground"
                : "border-border/70 bg-card/60 text-muted-foreground hover:text-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card/60 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coming at you</p>
          {day.incoming.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted-foreground">Nothing worth your attention.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {day.incoming.map((x) => (
                <li key={x} className="truncate text-[12.5px] text-foreground/80">
                  {x}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Echo</p>
          <ul className="mt-2 space-y-2">
            {day.echo.map((x) => (
              <li key={x} className="text-[13.5px] leading-relaxed">
                {x}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="text-[12px] text-muted-foreground">{day.note}</p>
    </div>
  );
}
