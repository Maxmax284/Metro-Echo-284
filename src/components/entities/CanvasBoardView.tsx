import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2, ChevronRight, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { vantaToast as toast } from "@/lib/vantaVoice";

type Action = {
  id: string;
  title: string;
  status: "proposed" | "staged" | "approved" | "executed" | "audited" | "rolled_back" | "cancelled" | "needs_credentials";
  risk: string;
  created_at: string;
};

type Props = { seedEntityId: string | null; windowDays?: 7 | 30 | 90 };

type Column = { key: string; label: string; statuses: Action["status"][] };

const COLUMNS: Column[] = [
  { key: "pending", label: "Pending", statuses: ["proposed", "staged"] },
  { key: "active", label: "Active", statuses: ["approved"] },
  { key: "waiting", label: "Waiting", statuses: ["needs_credentials"] },
  { key: "done", label: "Done", statuses: ["executed", "audited"] },
];

const NEXT: Partial<Record<Action["status"], Action["status"]>> = {
  proposed: "staged",
  staged: "approved",
  approved: "executed",
  executed: "audited",
};

// Phase 6c — Board view. Tap to advance status via actions-transition. No
// drag-drop on 384px; tap targets stay big. Cancel always available pre-exec.
export function CanvasBoardView({ seedEntityId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Action[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let ids: string[] | null = null;
    if (seedEntityId) {
      const { data: links } = await supabase
        .from("entity_links")
        .select("source_id")
        .eq("user_id", user.id)
        .eq("entity_id", seedEntityId)
        .eq("source_kind", "action")
        .limit(200);
      ids = ((links ?? []) as any[]).map((l) => l.source_id);
      if (ids.length === 0) {
        setActions([]);
        setLoading(false);
        return;
      }
    }
    const q = supabase
      .from("actions")
      .select("id, title, status, risk, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    const { data } = ids ? await q.in("id", ids) : await q;
    setActions(((data ?? []) as Action[]));
    setLoading(false);
  }, [user, seedEntityId]);

  useEffect(() => { load(); }, [load]);

  const transition = async (a: Action, to: Action["status"]) => {
    setBusy(a.id);
    try {
      const reason =
        to === "approved" && a.risk === "high"
          ? window.prompt("This is a high-risk action. Type 'approve' to confirm.") ?? ""
          : undefined;
      const { error } = await supabase.functions.invoke("actions-transition", {
        body: { action_id: a.id, to_status: to, reason },
      });
      if (error) throw error;
      toast.success({ title: `Moved to ${to}` });
      await load();
    } catch (e: any) {
      toast.fromError(e);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full min-w-max gap-2 px-3 py-2">
        {COLUMNS.map((col) => {
          const items = actions.filter((a) => col.statuses.includes(a.status));
          return (
            <div
              key={col.key}
              className="flex h-full w-[200px] shrink-0 flex-col rounded-xl border border-border bg-surface-elevated/40"
            >
              <div className="flex items-center justify-between px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>{col.label}</span>
                <span className="rounded-full bg-background/80 px-1.5 text-[10px]">{items.length}</span>
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto px-2 pb-2">
                {items.length === 0 && (
                  <div className="px-1 py-2 text-[11px] text-muted-foreground">Empty</div>
                )}
                {items.map((a) => {
                  const next = NEXT[a.status];
                  const canCancel = ["proposed", "staged", "approved"].includes(a.status);
                  return (
                    <div
                      key={a.id}
                      className="rounded-lg border border-border/60 bg-background/80 p-2"
                    >
                      <div className="line-clamp-2 text-[12.5px] text-foreground">{a.title}</div>
                      <div className="mt-1 flex items-center gap-1">
                        {a.risk === "high" && (
                          <Badge variant="outline" className="border-warn/50 text-[10px] text-warn">
                            high risk
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[10px] capitalize">{a.status}</Badge>
                      </div>
                      {(next || canCancel) && (
                        <div className="mt-2 flex items-center gap-1">
                          {next && (
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={busy === a.id}
                              onClick={() => transition(a, next)}
                              className="h-7 flex-1 text-[11px]"
                            >
                              {next} <ChevronRight className="ml-1 h-3 w-3" />
                            </Button>
                          )}
                          {canCancel && (
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={busy === a.id}
                              onClick={() => transition(a, "cancelled")}
                              className="h-7 w-7 p-0 text-muted-foreground"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
