// Interactive approval controls rendered inside a structured Echo answer.
// Finds the scoped pending action(s) the answer is talking about and lets the
// user move them through the same review/approve/execute gate used in Actions.
// High-risk approvals are never one-tap: they hand off to the Actions surface.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Check, Loader2, Shield, ShieldAlert, ShieldCheck } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { useCurrentContext } from "@/providers/CurrentContextProvider";
import { ExecuteConfirmDialog } from "@/components/actions/ExecuteConfirmDialog";
import { ActionReceiptDrawer } from "@/components/actions/ActionReceiptDrawer";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { askAftermath, aftermathLine } from "@/lib/vantaNouns";

type PendingStatus = "proposed" | "staged" | "approved";

type PendingAction = {
  id: string;
  title: string;
  description: string | null;
  risk: "low_reversible" | "standard" | "high";
  status: PendingStatus;
  payload: Record<string, unknown> | null;
  source: string | null;
  affected_entities: unknown[] | null;
  rollback_available: boolean | null;
};

const RiskIcon = { low_reversible: ShieldCheck, standard: Shield, high: ShieldAlert } as const;
const riskTone = {
  low_reversible: "text-signal",
  standard: "text-primary",
  high: "text-warn",
};

const STOP = new Set(["the", "a", "an", "to", "for", "and", "of", "in", "on", "with", "this", "that", "your"]);

/** Cheap word-overlap score so the card shows the action the answer mentioned. */
function relevance(detail: string, a: PendingAction): number {
  const words = detail
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
  if (!words.length) return 0;
  const hay = `${a.title} ${a.description ?? ""}`.toLowerCase();
  return words.reduce((n, w) => (hay.includes(w) ? n + 1 : n), 0);
}

export function InlineApprovalActions({ detail }: { detail: string }) {
  const { session } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const { setContext } = useCurrentContext();
  const [items, setItems] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [executeTarget, setExecuteTarget] = useState<PendingAction | null>(null);
  const [receiptActionId, setReceiptActionId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await applyScope(
      supabase.from("actions").select("id, title, description, risk, status, payload, source, affected_entities, rollback_available"),
    )
      .in("status", ["proposed", "staged", "approved"])
      .order("updated_at", { ascending: false })
      .limit(25);
    const all = (data ?? []) as PendingAction[];
    const ranked = all
      .map((a) => ({ a, score: relevance(detail, a) }))
      .sort((x, y) => y.score - x.score);
    const matched = ranked.filter((r) => r.score > 0);
    setItems((matched.length ? matched : ranked).slice(0, 3).map((r) => r.a));
    setLoading(false);
  };

  useEffect(() => {
    if (session) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, scopeKey, detail]);

  const transition = async (a: PendingAction, to: string, reason?: string) => {
    setBusy(a.id);
    try {
      const { error } = await supabase.functions.invoke("actions-transition", {
        body: { action_id: a.id, to_status: to, reason: reason ?? "from Ask Echo" },
      });
      if (error) throw error;
      /* The confirmation names the desk that now owns the record, so the
         hand-off out of Ask always closes the loop. */
      toast.success(
        to === "cancelled"
          ? aftermathLine({ verb: "Cancelled", appearsIn: "Receipts" })
          : to === "staged"
            ? aftermathLine({ verb: "Staged", appearsIn: "Actions" })
            : aftermathLine({ verb: "Approved", appearsIn: "Actions" }),
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  };

  const execute = async (a: PendingAction) => {
    setBusy(a.id);
    try {
      const { error } = await supabase.functions.invoke("actions-execute", {
        body: { action_id: a.id },
      });
      if (error) throw error;
      toast.success(askAftermath("receipt"));
      setReceiptActionId(a.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execute failed.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking what's waiting…
      </div>
    );
  }

  if (!items.length) {
    return (
      <button
        type="button"
        onClick={() => setContext({ surface: "actions" })}
        className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-primary/10 px-2.5 text-[12px] font-medium text-primary transition-colors hover:bg-primary/20"
      >
        Review in Actions <ArrowUpRight className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2">
      {items.map((a) => {
        const Icon = RiskIcon[a.risk];
        const working = busy === a.id;
        return (
          <div key={a.id} className="rounded-lg bg-background/60 p-2.5 ring-1 ring-border/60">
            <div className="flex items-start gap-2">
              <Icon className={cn("mt-[2px] h-3.5 w-3.5 shrink-0", riskTone[a.risk])} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium leading-snug text-foreground">{a.title}</p>
                <p className="mt-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {a.status === "proposed" ? "Waiting to be staged" : a.status === "staged" ? "Waiting on your approval" : "Approved, ready to run"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.status === "proposed" && (
                <Button size="sm" variant="secondary" className="min-h-[44px]" disabled={working} onClick={() => transition(a, "staged")}>
                  Stage
                </Button>
              )}
              {a.status === "staged" && a.risk === "low_reversible" && (
                <Button size="sm" className="min-h-[44px]" disabled={working} onClick={() => transition(a, "approved")}>
                  Approve
                </Button>
              )}
              {a.status === "staged" && a.risk !== "low_reversible" && (
                <Button size="sm" className="min-h-[44px] gap-1" disabled={working} onClick={() => setContext({ surface: "actions" })}>
                  Review &amp; approve <ArrowUpRight className="h-3 w-3" />
                </Button>
              )}
              {a.status === "approved" && (
                <Button size="sm" className="min-h-[44px] gap-1" disabled={working} onClick={() => setExecuteTarget(a)}>
                  <Check className="h-3.5 w-3.5" /> Execute
                </Button>
              )}
              {a.status !== "approved" && (
                <Button size="sm" variant="ghost" className="min-h-[44px]" disabled={working} onClick={() => transition(a, "cancelled")}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="min-h-[44px] gap-1"
                onClick={() => setContext({ surface: "actions" })}
              >
                Open in Actions <ArrowUpRight className="h-3 w-3" />
              </Button>
              {working && <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            <AftermathHint
              text={
                a.status === "approved"
                  ? "Executing writes a Receipt and opens it here. Nothing else runs."
                  : `${askAftermath("action")} — approval still happens in Actions.`
              }
            />
          </div>
        );
      })}

      <ActionReceiptDrawer actionId={receiptActionId} awaitWrite onClose={() => setReceiptActionId(null)} />

      <ExecuteConfirmDialog
        action={executeTarget}
        busy={!!executeTarget && busy === executeTarget.id}
        onCancel={() => setExecuteTarget(null)}
        onConfirm={async () => {
          const t = executeTarget;
          if (!t) return;
          await execute(t);
          setExecuteTarget(null);
        }}
      />
    </div>
  );
}
