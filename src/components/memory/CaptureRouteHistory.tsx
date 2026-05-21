// CaptureRouteHistory — drawer listing every recorded triage action for one
// capture (from capture_routes). Read-only receipts so the user can always
// see what was suggested, what they did, and when.
import { useEffect, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { loadCaptureHistory, type CaptureKind } from "@/hooks/useCaptureRoute";

const ACTION_LABEL: Record<string, string> = {
  accepted: "Accepted suggestion",
  edited: "Edited route",
  dismissed: "Dismissed suggestion",
  archived: "Archived",
  attached: "Attached",
  ignored: "Filed away",
  reviewed: "Marked reviewed",
  snoozed: "Snoozed",
  unsnoozed: "Brought back",
  routed: "Routed",
  undo: "Undid action",
};

export function CaptureRouteHistory({
  captureKind,
  captureId,
  trigger,
}: {
  captureKind: CaptureKind;
  captureId: string;
  trigger?: ReactNode;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    setLoading(true);
    loadCaptureHistory(user.id, captureKind, captureId)
      .then((data) => alive && setRows(data))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [open, user?.id, captureKind, captureId]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {trigger ?? (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground">
            <History className="h-3 w-3" />
            History
          </Button>
        )}
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-md">
        <SheetHeader>
          <SheetTitle>Route history</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {loading && <p className="text-xs text-muted-foreground">Pulling receipts…</p>}
          {!loading && rows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No routes recorded yet. Any action you take will land here.
            </p>
          )}
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border border-border/60 bg-surface-elevated/40 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground/90">
                  {ACTION_LABEL[r.user_action] ?? r.user_action}
                </span>
                <span className="text-[10.5px] text-muted-foreground">
                  {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1 text-[10.5px] text-muted-foreground">
                {r.source && (
                  <span className="rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">{r.source}</span>
                )}
                {r.suggested_route && (
                  <span className="rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
                    suggested → {r.suggested_route}
                  </span>
                )}
                {r.previous_status && r.new_status && (
                  <span className="rounded-full bg-muted/10 px-2 py-0.5 ring-1 ring-border/40">
                    {r.previous_status} → {r.new_status}
                  </span>
                )}
                {r.sherlock_finding_id && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary ring-1 ring-primary/30">
                    sherlock
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
