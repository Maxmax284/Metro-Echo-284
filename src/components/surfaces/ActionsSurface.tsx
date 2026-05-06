import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert, Shield, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

type Action = {
  id: string;
  title: string;
  description: string | null;
  risk: "low_reversible" | "standard" | "high";
  status: "proposed" | "staged" | "approved" | "executed" | "audited" | "rolled_back" | "cancelled";
  created_at: string;
  updated_at: string;
};

const RiskIcon = { low_reversible: ShieldCheck, standard: Shield, high: ShieldAlert } as const;
const riskColor = {
  low_reversible: "text-signal",
  standard: "text-primary",
  high: "text-warn",
};

const statusOrder: Action["status"][] = ["proposed", "staged", "approved", "executed", "audited"];

export function ActionsSurface() {
  const { session } = useAuth();
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("actions")
      .select("id, title, description, risk, status, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    setActions((data ?? []) as Action[]);
    setLoading(false);
  };

  useEffect(() => { if (session) refresh(); }, [session]);

  const transition = async (a: Action, to: Action["status"], reason?: string) => {
    setBusy(a.id);
    try {
      const { error } = await supabase.functions.invoke("actions-transition", {
        body: { action_id: a.id, to_status: to, reason },
      });
      if (error) throw error;
      toast.success(`Moved to ${to}`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transition failed");
    } finally {
      setBusy(null);
    }
  };

  const groups = {
    "Ready to act": actions.filter((a) => a.status === "approved"),
    "Awaiting review": actions.filter((a) => a.status === "proposed" || a.status === "staged"),
    "Recently executed": actions.filter((a) => a.status === "executed" || a.status === "audited"),
    "Cancelled / rolled back": actions.filter((a) => a.status === "rolled_back" || a.status === "cancelled"),
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Actions</h2>
        <p className="text-xs text-muted-foreground">What you can do right now. Nothing executes silently.</p>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
        {loading && <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && actions.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No actions yet. Stage one from the conversation.
          </div>
        )}
        {!loading && Object.entries(groups).map(([label, list]) =>
          list.length === 0 ? null : (
            <section key={label} className="mb-6">
              <h3 className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">{label}</h3>
              <ul className="space-y-2">
                {list.map((a) => {
                  const Icon = RiskIcon[a.risk];
                  return (
                    <li key={a.id} className="rounded-xl surface-elevated p-3 ring-1 ring-border/60">
                      <div className="flex items-start gap-2">
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", riskColor[a.risk])} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-3">
                            <h4 className="truncate text-sm font-medium">{a.title}</h4>
                            <span className="shrink-0 text-[10.5px] text-muted-foreground">
                              {formatDistanceToNow(new Date(a.updated_at), { addSuffix: true })}
                            </span>
                          </div>
                          {a.description && <p className="mt-1 text-[13px] text-muted-foreground">{a.description}</p>}
                          <div className="mt-2 flex items-center gap-1.5">
                            {statusOrder.map((s) => (
                              <span
                                key={s}
                                className={cn(
                                  "h-1 flex-1 rounded-full",
                                  statusOrder.indexOf(a.status) >= statusOrder.indexOf(s)
                                    ? "bg-primary/70"
                                    : "bg-border/50"
                                )}
                              />
                            ))}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {a.status === "proposed" && (
                              <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => transition(a, "staged")}>
                                Stage
                              </Button>
                            )}
                            {a.status === "staged" && (
                              <Button size="sm" disabled={busy === a.id} onClick={() => transition(a, "approved")}>
                                Approve
                              </Button>
                            )}
                            {a.status === "approved" && (
                              <Button size="sm" disabled={busy === a.id} onClick={() => transition(a, "executed", "manual execute")} className="gap-1">
                                <Check className="h-3.5 w-3.5" /> Execute
                              </Button>
                            )}
                            {a.status === "executed" && (
                              <Button size="sm" variant="secondary" disabled={busy === a.id} onClick={() => transition(a, "audited", "reviewed")}>
                                Mark reviewed
                              </Button>
                            )}
                            {(a.status === "executed" || a.status === "audited") && (
                              <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => transition(a, "rolled_back", "user rollback")} className="gap-1">
                                <RotateCcw className="h-3.5 w-3.5" /> Rollback
                              </Button>
                            )}
                            {(a.status === "proposed" || a.status === "staged") && (
                              <Button size="sm" variant="ghost" disabled={busy === a.id} onClick={() => transition(a, "cancelled")}>
                                Cancel
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        )}
      </div>
    </div>
  );
}
