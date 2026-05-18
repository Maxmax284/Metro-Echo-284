import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, Sparkles } from "lucide-react";
import { useAwareness } from "@/providers/AwarenessProvider";
import { SignalCard } from "@/components/awareness/SignalCard";
import { useSignalRoute } from "@/lib/useSignalRoute";

type Props = {
  section: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

/**
 * SectionDrawer — focused single-section view. Reuses SignalCard.
 * Refresh is a secondary action; read is primary.
 */
export function SectionDrawer({ section, open, onOpenChange }: Props) {
  const { latestBySection, generate, generating, place } = useAwareness();
  const onSignalRoute = useSignalRoute();
  const b = section ? latestBySection[section] : undefined;
  const busy = !!section && generating === section;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[88dvh] p-0">
        <DrawerHeader className="border-b border-border/60">
          <DrawerTitle className="flex items-center justify-between gap-2 text-sm capitalize">
            <span>{section ?? ""}</span>
            {place && section && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-[11px]"
                disabled={busy}
                onClick={() => generate(section)}
                title={b ? "Refresh this layer" : "Scan this layer now"}
              >
                {busy
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : b ? <RefreshCcw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                {b ? "Refresh" : "Scan layer"}
              </Button>
            )}
          </DrawerTitle>
        </DrawerHeader>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-3">
          {b ? (
            <SignalCard
              signal={b.signal ?? { title: section ?? "", short_summary: b.content, confidence: b.confidence ?? "low" }}
              fallbackBody={b.content}
              generatedAt={b.generated_at}
              onRoute={onSignalRoute}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-border/60 p-4 text-[12.5px] text-muted-foreground">
              No scan for this layer yet. Tap <span className="font-medium text-foreground/80">Scan layer</span> when you want one.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
