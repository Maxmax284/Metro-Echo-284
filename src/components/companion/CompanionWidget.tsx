import { useLocation } from "react-router-dom";
import { MessageCircle, X, Maximize2, Minimize2 } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useCompanion } from "./CompanionContext";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { useAwareness } from "@/providers/AwarenessProvider";
import { ConversationSurface } from "@/components/surfaces/ConversationSurface";
import { useIntentHandler } from "@/hooks/useIntentHandler";
import { useAuth } from "@/lib/auth";

export function CompanionWidget() {
  const { user } = useAuth();
  const { mode, open, close, expand, collapse } = useCompanion();
  const { context } = useCurrentContext();
  const { overall: awareness } = useAwareness();
  const isMobile = useIsMobile();
  const onIntent = useIntentHandler();
  const location = useLocation();

  if (!user || location.pathname === "/auth") return null;

  const Body = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-foreground">Companion</span>
          <span className="text-[10px] text-muted-foreground">
            On <span className="text-foreground/80">{context.surface}</span> · drafts only, never executes
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={mode === "full" ? collapse : expand}
            aria-label={mode === "full" ? "Collapse" : "Expand"}
          >
            {mode === "full" ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={close} aria-label="Close">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationSurface onIntent={onIntent} />
      </div>
    </div>
  );

  return (
    <>
      {/* Floating bubble */}
      {mode === "closed" && (
        <button
          onClick={open}
          aria-label="Open companion"
          className={cn(
            "fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full",
            "bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow",
            "transition-transform hover:scale-105 active:scale-95",
            "md:bottom-6 md:right-6"
          )}
        >
          <MessageCircle className="h-5 w-5" />
        </button>
      )}

      {/* Mobile drawer / desktop sheet */}
      {isMobile ? (
        <Drawer open={mode !== "closed"} onOpenChange={(o) => (!o ? close() : open())}>
          <DrawerContent className={cn("p-0", mode === "full" ? "h-[95dvh]" : "h-[80dvh]")}>
            {Body}
          </DrawerContent>
        </Drawer>
      ) : (
        <Sheet open={mode !== "closed"} onOpenChange={(o) => (!o ? close() : open())}>
          <SheetContent
            side="right"
            className={cn(
              "flex flex-col p-0",
              mode === "full" ? "w-screen max-w-none sm:max-w-none" : "w-[440px] max-w-full sm:max-w-[440px]"
            )}
          >
            {Body}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}
