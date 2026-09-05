// RoomMap — "How Metro Echo Is Organized".
//
// One static screen. Four rooms, one sentence each, and what each room owns.
// Not onboarding, not a tour, no steps. Reachable from Explain This in every
// room so a confused user is never sent into Settings to hunt for it.
import { Link } from "react-router-dom";
import { ArrowLeft, Briefcase, MessageSquare, Receipt, Sun, type LucideIcon } from "lucide-react";
import { ROOM_MAP } from "@/lib/roomCopy";
import { GlossaryPanel } from "@/components/ui/glossary-panel";

const ICON: Record<string, LucideIcon> = {
  today: Sun,
  work: Briefcase,
  ask: MessageSquare,
  receipts: Receipt,
};

export default function RoomMapPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-6">
      <header className="mb-5 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to Metro Echo"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight">How Metro Echo Is Organized</h1>
          <p className="text-xs text-muted-foreground">Four rooms. Each one owns different things.</p>
        </div>
      </header>

      <ul className="space-y-2.5">
        {ROOM_MAP.map((room) => {
          const Icon = ICON[room.key] ?? Sun;
          return (
            <li key={room.key} className="vanta-card p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[14px] font-semibold tracking-tight">{room.title}</h2>
                  <p className="text-[12px] text-muted-foreground">{room.purpose}</p>
                </div>
              </div>
              <p className="mt-3 text-[10.5px] uppercase tracking-[0.14em] text-muted-foreground/70">Owns</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {room.owns.map((o) => (
                  <li
                    key={o}
                    className="rounded-full border border-border/50 bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                  >
                    {o}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>

      <section className="vanta-card mt-4 p-4" aria-labelledby="glossary-heading">
        <h2 id="glossary-heading" className="text-[14px] font-semibold tracking-tight">
          What the words mean
        </h2>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Plain English for every noun Echo uses, including the ones people mix up.
        </p>
        <GlossaryPanel className="mt-3" />
      </section>

      <p className="mt-5 text-[12px] leading-snug text-muted-foreground">
        Nothing runs on its own. Echo drafts, you approve, and every change leaves a receipt.
      </p>
    </div>
  );
}
