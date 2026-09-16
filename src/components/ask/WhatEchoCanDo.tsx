// WhatEchoCanDo — reach, stated honestly, one tap from Ask.
//
// Doctrine: no capability is advertised without a record behind it. The rows come
// from the shared pure module, so this panel, Ask's answer and Telegram's answer
// can never describe different powers. Nothing here executes anything.
import { Zap } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useEchoAbilities } from "@/hooks/useEchoAbilities";
import { useLifeDomains } from "@/hooks/useLifeDomains";
import { abilityLine, type AbilityState } from "@/lib/echoAbilities";
import { lifeLine } from "@/lib/streetSmart";
import { MOTION_FOCUS, MOTION_MICRO } from "@/lib/motion";
import { cn } from "@/lib/utils";

const STATE_WORD: Record<AbilityState, string> = {
  live: "Now",
  needs_connecting: "Connect first",
  not_yet: "Not yet",
};

const STATE_CLASS: Record<AbilityState, string> = {
  live: "border-primary/50 text-primary",
  needs_connecting: "border-border text-muted-foreground",
  not_yet: "border-border/60 text-muted-foreground/70",
};

export function WhatEchoCanDo({ className }: { className?: string }) {
  const { abilities, loading } = useEchoAbilities();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="What can Echo do?"
          title="What can Echo do?"
          className={cn(
            "shrink-0 rounded-[2px] p-1 text-muted-foreground/80 hover:text-foreground",
            MOTION_MICRO,
            MOTION_FOCUS,
            className,
          )}
        >
          <Zap className="h-4 w-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-[19rem] overflow-y-auto p-3 text-[12px] leading-relaxed">
        <p className="vanta-machine-label mb-2 text-foreground/70">What can Echo do?</p>
        {loading && abilities.length === 0 ? (
          <p className="text-muted-foreground">Checking what is connected…</p>
        ) : (
          <>
            <p className="mb-2 text-foreground/90">{abilityLine(abilities)}</p>
            <ul className="space-y-2">
              {abilities.map((a) => (
                <li key={a.id} className="border-l-2 border-border/70 pl-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground/90">{a.label}</p>
                    <span
                      className={cn(
                        "shrink-0 rounded-[2px] border px-1 text-[9px] uppercase tracking-[0.14em]",
                        STATE_CLASS[a.state],
                      )}
                    >
                      {STATE_WORD[a.state]}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{a.plain}</p>
                  {a.because && <p className="text-muted-foreground/80">{a.because}</p>}
                  {a.limit && <p className="text-[11px] text-muted-foreground/80">{a.limit}</p>}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted-foreground/80">Nothing on this list acts on its own.</p>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
