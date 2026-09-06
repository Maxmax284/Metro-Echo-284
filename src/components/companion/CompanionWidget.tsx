import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle, X, Maximize2, Minimize2, Check, ArrowUpRight } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompanion } from "./CompanionContext";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { useAwareness } from "@/providers/AwarenessProvider";
import { ConversationSurface } from "@/components/surfaces/ConversationSurface";
import { useAuth } from "@/lib/auth";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { getAskSession, subscribeAskSession } from "@/lib/askSession";
import { outputSummary } from "@/lib/askThreads";
import { promoteToAskRoom, shouldSuggestPromotion } from "@/lib/askPromotion";
import { useMode, MODE_LABEL, MODE_DESCRIPTION, type AppMode } from "@/hooks/useMode";

const MODE_TINT: Record<AppMode, string> = {
  locked: "bg-muted/40 text-muted-foreground ring-border/60",
  observer: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
  advisor: "bg-primary/15 text-primary ring-primary/40",
  operator: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
};

const FRESHNESS_DOT: Record<string, string> = {
  fresh: "bg-primary",
  aging: "bg-amber-400",
  stale: "bg-destructive",
  missing: "bg-muted-foreground/50",
};

export function CompanionWidget() {
  const { user } = useAuth();
  const { mode: panelMode, open, close, expand, collapse } = useCompanion();
  const { context } = useCurrentContext();
  const { overall: awareness } = useAwareness();
  const { mode, setMode } = useMode();
  const isMobile = useIsMobile();
  const location = useLocation();
  const { active } = useAskThreads();

  // Wave 4 — a turn keeps running when the drawer is closed, so the bubble says
  // so instead of pretending nothing is happening.
  const [thinking, setThinking] = useState(false);
  useEffect(() => {
    if (!active?.id) { setThinking(false); return; }
    setThinking(getAskSession(active.id).streaming);
    return subscribeAskSession(active.id, (s) => setThinking(s.streaming));
  }, [active?.id]);

  const inAskRoom = context.surface === "ask";
  const producedSummary = outputSummary(active?.outputs);
  const suggestPromotion = shouldSuggestPromotion({
    messageCount: active ? 1 : 0,
    hasOutputs: !!producedSummary,
    inAskRoom,
  });

  if (!user || location.pathname === "/auth") return null;

  const modes: AppMode[] = ["locked", "observer", "advisor", "operator"];

  const Body = (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-start justify-between gap-2 border-b border-border/60 bg-surface-elevated/60 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Row 1 — identity */}
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-medium text-foreground">Quick Ask</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1 transition-opacity hover:opacity-80",
                    MODE_TINT[mode],
                  )}
                  aria-label="Change mode"
                >
                  {MODE_LABEL[mode]}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1">
                {modes.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-surface-elevated",
                      m === mode && "bg-surface-elevated",
                    )}
                  >
                    <Check className={cn("mt-0.5 h-3 w-3", m === mode ? "text-primary" : "opacity-0")} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-foreground">{MODE_LABEL[m]}</span>
                      <span className="block text-[10px] leading-snug text-muted-foreground">{MODE_DESCRIPTION[m]}</span>
                    </span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <span className="rounded-full bg-surface-elevated px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
              Drafts only
            </span>
          </div>
          {/* Row 2 — situation */}
          <div className="hidden flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground sm:flex">
            <span className="rounded-full bg-surface-elevated/60 px-1.5 py-0.5 ring-1 ring-border/40">
              on <span className="text-foreground/80">{context.surface}</span>
            </span>
            {awareness.place ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-elevated/60 px-1.5 py-0.5 ring-1 ring-border/40">
                <span className={cn("h-1.5 w-1.5 rounded-full", FRESHNESS_DOT[awareness.freshness] ?? FRESHNESS_DOT.missing)} />
                <span className="text-foreground/80">{awareness.place.label}</span>
                <span className="uppercase tracking-wider text-muted-foreground/80">
                  {awareness.freshness}{awareness.confidence ? ` · ${awareness.confidence}` : ""}
                </span>
              </span>
            ) : (
              <span className="rounded-full bg-surface-elevated/60 px-1.5 py-0.5 ring-1 ring-border/40">
                no place set
              </span>
            )}
            {awareness.freshness === "stale" && (
              <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-destructive ring-1 ring-destructive/40">
                stale
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!inAskRoom && (
            <button
              type="button"
              onClick={() => { promoteToAskRoom(); close(); }}
              title={producedSummary ? `This thread made ${producedSummary}` : "Same thread, more room"}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[11px] uppercase tracking-wider ring-1 transition-colors",
                suggestPromotion
                  ? "bg-primary/15 text-primary ring-primary/40"
                  : "bg-surface-elevated text-muted-foreground ring-border/60 hover:text-foreground",
              )}
            >
              Continue in Ask
              <ArrowUpRight className="h-3 w-3" />
            </button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={panelMode === "full" ? collapse : expand}
            aria-label={panelMode === "full" ? "Collapse" : "Expand"}
          >
            {panelMode === "full" ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={close} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationSurface />
      </div>
    </div>
  );

  return (
    <>
      {/* Docked Ask trigger — part of the shell, not a bubble floating over it.
          Desktop: a tab welded to the right edge. Mobile: a pill flush with the
          bottom nav, so Ask reads as the fifth edge of the rig, not an overlay. */}
      {panelMode === "closed" && !inAskRoom && (
        <button
          onClick={open}
          aria-label="Open Ask"
          className={cn(
            "fixed z-40 inline-flex items-center gap-1.5 border border-border/70 border-r-0 bg-surface/95 backdrop-blur",
            "text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground",
            "transition-colors hover:text-foreground hover:bg-surface-elevated",
            "right-0 bottom-[76px] rounded-l-[3px] px-3 py-2.5",
            "md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:flex-col md:px-2 md:py-3.5",
            thinking && "text-accent border-accent/50",
          )}
          title={thinking ? "Still working on your last question" : "Ask Echo"}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="md:[writing-mode:vertical-rl]">Ask</span>
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              thinking ? "bg-accent motion-safe:animate-pulse" : FRESHNESS_DOT[awareness.freshness] ?? FRESHNESS_DOT.missing,
            )}
            aria-label={thinking ? "answering now" : `awareness ${awareness.freshness}`}
          />
        </button>
      )}

      {/* Mobile drawer / desktop sheet */}
      {isMobile ? (
        <Drawer open={panelMode !== "closed"} onOpenChange={(o) => (!o ? close() : open())}>
          {/* Bottom sheet: tall enough to read a thread, opaque so the painted
              wall never fights the text, and it clears the bottom nav. */}
          <DrawerContent
            className={cn(
              "safe-bottom overflow-hidden border-border/70 bg-background p-0",
              panelMode === "full" ? "h-[95dvh]" : "h-[82dvh]",
            )}
          >
            {Body}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={panelMode !== "closed"} onOpenChange={(o) => (!o ? close() : open())}>
          <SheetContent
            side="right"
            className={cn(
              "flex flex-col bg-background p-0",
              panelMode === "full" ? "w-screen max-w-none sm:max-w-none" : "w-[460px] max-w-full sm:max-w-[460px]"
            )}
          >
            {Body}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
