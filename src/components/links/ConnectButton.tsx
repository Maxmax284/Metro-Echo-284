// ConnectButton — the universal entry point to ConnectSheet. Drop this in
// any card's footer/aftermath area. Doctrine: opens UI only.
import { useState } from "react";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectSheet } from "./ConnectSheet";
import type { CrossKind } from "@/lib/crossLinks";

export function ConnectButton({
  source,
  onLinked,
  className,
  size = "sm",
}: {
  source: { kind: CrossKind; id: string; label?: string };
  onLinked?: () => void;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground hover:border-border transition-colors",
          size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11.5px]",
          className,
        )}
        aria-label="Connect to another item"
      >
        <Link2 className={cn(size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3")} />
        Connect to…
      </button>
      <ConnectSheet open={open} onOpenChange={setOpen} source={source} onLinked={onLinked} />
    </>
  );
}
