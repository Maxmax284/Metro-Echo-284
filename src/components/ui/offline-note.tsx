import { CloudOff } from "lucide-react";
import { useNetworkReach } from "@/hooks/useNetworkReach";
import { cn } from "@/lib/utils";

/**
 * OfflineNote — the one line every room shows when the bars go. Everything on
 * screen is what was last on record; the room says so once, quietly, instead
 * of letting stale reads pass as fresh. Picks the feed back up on its own.
 */
export function OfflineNote({ className }: { className?: string }) {
  const { online } = useNetworkReach();
  if (online) return null;
  return (
    <p
      role="status"
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-border/50 bg-surface-elevated px-3 py-2 text-[11.5px] text-muted-foreground",
        className,
      )}
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      No signal — you're seeing what was last on record. New reads pick up on their own when you're back.
    </p>
  );
}
