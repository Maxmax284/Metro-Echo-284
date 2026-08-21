// ActionReceiptDrawer — opens the exact receipt for one action.
// Used right after Execute (so the user can verify what ran) and from the
// Receipt button on any action card.
import { useEffect, useState } from "react";
import { useFlipEntry } from "@/hooks/useFlipEntry";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowUpRight } from "lucide-react";
import { AuditDetailDrawer } from "@/components/audit/AuditDetailDrawer";
import { fetchActionReceipt, openReceiptsFor, waitForActionReceipt, type ReceiptRow } from "@/lib/receipts";
import { pulseGlyph } from "@/components/shell/PostureGlyph";

export function ActionReceiptDrawer({
  actionId,
  /** true right after an execute — poll for the row instead of giving up. */
  awaitWrite = false,
  onClose,
}: {
  actionId: string | null;
  awaitWrite?: boolean;
  onClose: () => void;
}) {
  const [row, setRow] = useState<ReceiptRow | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "missing">("idle");
  // The pending/missing drawer grows out of the button that was just tapped.
  const flipRef = useFlipEntry<HTMLDivElement>(!!actionId);

  useEffect(() => {
    let alive = true;
    if (!actionId) {
      setRow(null);
      setState("idle");
      return;
    }
    setState("loading");
    setRow(null);
    (async () => {
      const found = awaitWrite ? await waitForActionReceipt(actionId) : await fetchActionReceipt(actionId);
      if (!alive) return;
      setRow(found);
      setState(found ? "ready" : "missing");
      /* The receipt landing is a real event — the posture glyph acknowledges it
         once, then goes back to breathing. */
      if (found && awaitWrite) pulseGlyph("commit");
    })();

    return () => {
      alive = false;
    };
  }, [actionId, awaitWrite]);

  if (!actionId) return null;

  if (state === "ready" && row) {
    return (
      <AuditDetailDrawer
        row={row}
        open
        onOpenChange={(next) => !next && onClose()}
        footer={
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2 text-[11.5px] text-primary"
            onClick={() => {
              openReceiptsFor(actionId);
              onClose();
            }}
          >
            See in Receipts <ArrowUpRight className="h-3 w-3" />
          </Button>
        }
      />
    );
  }

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent ref={flipRef} side="bottom" className="rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-[14px]">
            {state === "missing" ? "No receipt yet" : "Writing the receipt"}
          </SheetTitle>
          <SheetDescription className="text-[11.5px]">
            {state === "missing"
              ? "Nothing has been logged against this one yet. Receipts appear once something actually runs."
              : "Hold on a second — Vanta is logging what just ran."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex items-center gap-2 py-4 text-[12px] text-muted-foreground">
          {state !== "missing" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {state === "missing" ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1 px-2 text-[11.5px] text-primary"
              onClick={() => {
                openReceiptsFor(actionId);
                onClose();
              }}
            >
              Open Receipts <ArrowUpRight className="h-3 w-3" />
            </Button>
          ) : (
            <span>Checking the log…</span>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
