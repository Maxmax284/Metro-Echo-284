// WhileYouWereOut — the first thing you read when you come back.
//
// Three lines maximum, each one a door. Never a count of unread anything.
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { useWhileYouWereOut } from "@/hooks/useWhileYouWereOut";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

export function WhileYouWereOut({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { read, acknowledge } = useWhileYouWereOut();
  if (!read) return null;

  return (
    <section className="vanta-card p-3" aria-label="What changed while you were out">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">Back in</MachineLabel>
      </div>
      <p className="mt-1.5 text-[13px] font-medium leading-snug text-foreground">{read.headline}</p>
      <ul className="mt-2 space-y-1.5">
        {read.lines.map((c) => (
          <li key={c.key}>
            <button
              type="button"
              onClick={() => onNavigate(c.surface as SurfaceKey)}
              className={cn(
                "flex w-full min-h-[44px] items-center gap-2 rounded-md border border-border/50 px-3 py-2 text-left",
                MOTION_FOCUS,
              )}
            >
              <span className="min-w-0 flex-1 break-words text-xs leading-snug text-foreground/90">{c.line}</span>
            </button>
          </li>
        ))}
      </ul>
      {read.more ? <p className="mt-1.5 text-[11px] text-muted-foreground">{read.more}</p> : null}
      <div className="mt-2">
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={acknowledge}>
          Caught up
        </Button>
      </div>
      <AftermathHint text="Nothing was approved or sent while you were away. This is the read, not an action." />
    </section>
  );
}
