// FlowRail — three beats, one line each: what you do, what Echo does, where it lands.
// Teaching without a wall of text. Never executes anything.
import { cn } from "@/lib/utils";

export type FlowBeat = { k: string; d: string };

export function FlowRail({ beats, className }: { beats: FlowBeat[]; className?: string }) {
  return (
    <ol className={cn("grid gap-1.5 sm:grid-cols-3", className)}>
      {beats.map((b, i) => (
        <li
          key={b.k}
          className="relative flex gap-2 rounded-[3px] border border-border/50 bg-surface-elevated/40 p-2"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/50 text-[10px] font-semibold tabular-nums text-primary">
            {i + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-[11.5px] font-medium leading-snug text-foreground">{b.k}</span>
            <span className="block text-[11px] leading-snug text-muted-foreground">{b.d}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export const FLOWS = {
  projects: [
    { k: "Name the thing", d: "A trip, a client, a rollout — anything with more than one moving part." },
    { k: "Attach what belongs", d: "Captures, notes, files and flights get pinned to it as they arrive." },
    { k: "Read the brief", d: "Echo keeps one running summary. You approve anything it suggests." },
  ],
  documents: [
    { k: "Pick a starting point", d: "A template, meeting notes, or a file you already have." },
    { k: "Echo drafts", d: "Grounded in what you gave it. Nothing is sent." },
    { k: "Review and export", d: "Edit, then save as PDF or Word. It lands in Receipts." },
  ],
  schedule: [
    { k: "See your day", d: "Calendar, reminders and promises in one timeline." },
    { k: "Ask for a change", d: "Echo prepares it as a proposal — nothing moves yet." },
    { k: "Approve it", d: "Only then does your calendar update, with a receipt." },
  ],
  flights: [
    { k: "Type a flight", d: "Number and day, like BR 31 on Oct 3." },
    { k: "Echo checks the airline", d: "Times, gate and delays from real sources, in local time." },
    { k: "Get told of changes", d: "Gate or delay updates show here, and on Telegram if you opted in." },
  ],
  money: [
    { k: "Connect a bank", d: "Read-only. Echo can see, never move money." },
    { k: "Echo reads", d: "Balances and recent spending, summarised in plain words." },
    { k: "You decide", d: "Anything it suggests is a draft for you to act on yourself." },
  ],
} satisfies Record<string, FlowBeat[]>;
