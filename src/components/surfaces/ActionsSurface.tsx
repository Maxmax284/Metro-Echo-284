import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, ShieldCheck, ShieldAlert, Shield, RotateCcw, Check, History, Boxes, FileCode2, ScrollText } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { SherlockChipTrigger } from "@/components/sherlock/SherlockChipTrigger";
import { EmbeddedSherlockFindings } from "@/components/sherlock/EmbeddedSherlockFindings";
import { ConnectButton } from "@/components/links/ConnectButton";
import { LinkedChipsBar } from "@/components/links/LinkedChipsBar";
import { ExecuteConfirmDialog } from "@/components/actions/ExecuteConfirmDialog";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { MOTION_FOCUS } from "@/lib/motion";
import { ActionReceiptDrawer } from "@/components/actions/ActionReceiptDrawer";

type Action = {
  id: string;
  title: string;
  description: string | null;
  risk: "low_reversible" | "standard" | "high";
  status: "proposed" | "staged" | "approved" | "executed" | "audited" | "rolled_back" | "cancelled";
  created_at: string;
  updated_at: string;
  payload: Record<string, unknown> | null;
  source: string | null;
  affected_entities: unknown[] | null;
  rollback_available: boolean | null;
};

const RiskIcon = { low_reversible: ShieldCheck, standard: Shield, high: ShieldAlert } as const;
const riskColor = {
  low_reversible: "text-signal",
  standard: "text-primary",
  high: "text-warn",
};
const riskLabel = {
  low_reversible: "Low risk · reversible",
  standard: "Standard risk",
  high: "High risk",
};

const statusOrder: Action["status"][] = ["proposed", "staged", "approved", "executed", "audited"];

type Executor = { id: string; name: string; kind: "webhook" | "telegram"; enabled: boolean };


export function ActionsSurface() {
  const { session } = useAuth();
  const { scope, applyScope, key: scopeKey } = useScope();
  const [actions, setActions] = useState<Action[]>([]);
  const [executors, setExecutors] = useState<Executor[]>([]);
  const [chosenExecutor, setChosenExecutor] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<Action | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [rollbackTarget, setRollbackTarget] = useState<Action | null>(null);
  const [executeTarget, setExecuteTarget] = useState<Action | null>(null);
  const [rollbackText, setRollbackText] = useState("");
  const [receiptActionId, setReceiptActionId] = useState<string | null>(null);
  const [receiptAwaitWrite, setReceiptAwaitWrite] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const [a, e] = await Promise.all([
      applyScope(supabase.from("actions").select("id, title, description, risk, status, created_at, updated_at, payload, source, affected_entities, rollback_available")).order("updated_at", { ascending: false }).limit(100),
      supabase.from("action_executors").select("id, name, kind, enabled").eq("enabled", true),
    ]);
    setActions((a.data ?? []) as Action[]);
    setExecutors((e.data ?? []) as Executor[]);
    setLoading(false);
  };

  useEffect(() => { if (session) refresh(); }, [session, scopeKey]);

  const transition = async (a: Action, to: Action["status"], reason?: string) => {
    setBusy(a.id);
    try {
      const { data, error } = await supabase.functions.invoke("actions-transition", {
        body: { action_id: a.id, to_status: to, reason },
      });
      const payload = data as { undo?: { undone: boolean; detail: string } | null; error?: string } | null;
      if (error || payload?.error) throw new Error(payload?.error || error?.message || "Transition failed");
      if (to === "rolled_back") {
        // Say what actually happened in the world, not just what the row says.
        toast.success({
          title: payload?.undo?.undone ? "Undone." : "Marked undone.",
          description: payload?.undo?.detail ?? undefined,
        });
      } else {
        toast.success(`Moved to ${to}`);
      }
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Transition failed");
    } finally {
      setBusy(null);
    }
  };

  const execute = async (a: Action) => {
    const executor_id = chosenExecutor[a.id];
    setBusy(a.id);
    try {
      if (executor_id) {
        const { data, error } = await supabase.functions.invoke("actions-execute", {
          body: { action_id: a.id, executor_id },
        });
        if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
        toast.success("Executed.");
        setReceiptAwaitWrite(true);
        setReceiptActionId(a.id);
        refresh();
      } else {
        await transition(a, "executed", "manual execute");
        setReceiptAwaitWrite(true);
        setReceiptActionId(a.id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Execute failed");
    } finally {
      setBusy(null);
    }
  };

  const groups = {
    "Ready to run": actions.filter((a) => a.status === "approved"),
    "Needs your eye": actions.filter((a) => a.status === "proposed" || a.status === "staged"),
    "Just ran": actions.filter((a) => a.status === "executed" || a.status === "audited"),
    "Cancelled or undone": actions.filter((a) => a.status === "rolled_back" || a.status === "cancelled"),
  };

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 pt-3 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Actions</h2>
        <p className="text-xs text-muted-foreground">What you can do right now. Nothing runs without your OK.</p>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
        {loading && <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && actions.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Nothing here yet. Drafts show up when Vanta proposes something.
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
                    <li key={a.id} className="vanta-focus-card rounded-xl surface-elevated border border-transparent p-3 ring-1 ring-border/60">
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
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <SherlockChipTrigger
                              operation="relate"
                              entityType="action"
                              entityId={a.id}
                              text={`${a.title}\n${a.description ?? ""}`}
                              title={a.title}
                              showWhenEmpty={false}
                            />
                            <ConnectButton source={{ kind: "action", id: a.id, label: a.title }} />
                          </div>
                          <div className="mt-1.5">
                            <LinkedChipsBar source={{ kind: "action", id: a.id }} />
                          </div>
                          <EmbeddedSherlockFindings sourceType="action" sourceId={a.id} />
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
                              <Button size="sm" variant="secondary" className={MOTION_FOCUS} disabled={busy === a.id} onClick={() => transition(a, "staged")}>
                                Stage
                              </Button>
                            )}
                            {a.status === "staged" && (
                              <Button
                                size="sm"
                                disabled={busy === a.id}
                                onClick={() => {
                                  if (a.risk === "low_reversible") {
                                    transition(a, "approved");
                                  } else {
                                    setConfirmText("");
                                    setApprovalTarget(a);
                                  }
                                }}
                              >
                                {a.risk === "low_reversible" ? "Approve" : "Review & Approve"}
                              </Button>
                            )}
                            {a.status === "approved" && (
                              <>
                                {executors.length > 0 && (
                                  <select
                                    className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                                    value={chosenExecutor[a.id] ?? ""}
                                    onChange={(ev) => setChosenExecutor((m) => ({ ...m, [a.id]: ev.target.value }))}
                                  >
                                    <option value="">manual</option>
                                    {executors.map((ex) => (
                                      <option key={ex.id} value={ex.id}>{ex.kind}: {ex.name}</option>
                                    ))}
                                  </select>
                                )}
                                <Button size="sm" className={MOTION_FOCUS} disabled={busy === a.id} onClick={(e) => { markFlipOriginFromEvent(e); setExecuteTarget(a); }} className="gap-1">
                                  <Check className="h-3.5 w-3.5" /> Execute
                                </Button>
                              </>
                            )}
                            {a.status === "executed" && (
                              <Button size="sm" variant="secondary" className={MOTION_FOCUS} disabled={busy === a.id} onClick={() => transition(a, "audited", "reviewed")}>
                                Mark reviewed
                              </Button>
                            )}
                            {(a.status === "executed" || a.status === "audited" || a.status === "rolled_back") && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="gap-1"
                                onClick={(e) => { markFlipOriginFromEvent(e); setReceiptAwaitWrite(false); setReceiptActionId(a.id); }}
                              >
                                <ScrollText className="h-3.5 w-3.5" /> Receipt
                              </Button>
                            )}
                            {(a.status === "executed" || a.status === "audited") && (
                              <Button size="sm" variant="ghost" className={MOTION_FOCUS} disabled={busy === a.id} onClick={() => { setRollbackText(""); setRollbackTarget(a); }} className="gap-1">
                                <RotateCcw className="h-3.5 w-3.5" /> Undo
                              </Button>
                            )}
                            {(a.status === "proposed" || a.status === "staged") && (
                              <Button size="sm" variant="ghost" className={MOTION_FOCUS} disabled={busy === a.id} onClick={() => transition(a, "cancelled")}>
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

      <ActionReceiptDrawer
        actionId={receiptActionId}
        awaitWrite={receiptAwaitWrite}
        onClose={() => setReceiptActionId(null)}
      />

      <ExecuteConfirmDialog
        action={executeTarget}
        executors={executors}
        executorId={executeTarget ? chosenExecutor[executeTarget.id] : undefined}
        onExecutorChange={(id) =>
          executeTarget && setChosenExecutor((m) => ({ ...m, [executeTarget.id]: id }))
        }
        busy={!!executeTarget && busy === executeTarget.id}
        onCancel={() => setExecuteTarget(null)}
        onConfirm={async () => {
          const t = executeTarget;
          if (!t) return;
          await execute(t);
          setExecuteTarget(null);
        }}
      />

      <Dialog open={!!approvalTarget} onOpenChange={(o) => !o && setApprovalTarget(null)}>
        <DialogContent className="max-w-lg">
          {approvalTarget && (() => {
            const t = approvalTarget;
            const Icon = RiskIcon[t.risk];
            const needsPhrase = t.risk === "high";
            const phraseOk = !needsPhrase || confirmText.trim().toLowerCase() === "approve";
            const affectedCount = Array.isArray(t.affected_entities) ? t.affected_entities.length : 0;
            const payloadStr = t.payload && Object.keys(t.payload).length > 0
              ? JSON.stringify(t.payload, null, 2)
              : null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Icon className={cn("h-5 w-5", riskColor[t.risk])} />
                    Take a look before you approve
                  </DialogTitle>
                  <DialogDescription className="space-y-2">
                    <span className="block text-sm font-medium text-foreground">{t.title}</span>
                    {t.description && (
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    )}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className={cn("gap-1", riskColor[t.risk])}>
                      <Icon className="h-3 w-3" /> {riskLabel[t.risk]}
                    </Badge>
                    {t.source && (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <History className="h-3 w-3" /> via {t.source}
                      </Badge>
                    )}
                    {affectedCount > 0 && (
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <Boxes className="h-3 w-3" /> touches {affectedCount}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={cn("gap-1", t.rollback_available ? "text-signal" : "text-muted-foreground")}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t.rollback_available ? "Can be undone" : "Can't be undone"}
                    </Badge>
                  </div>

                  {payloadStr && (
                    <details className="rounded-md ring-1 ring-border/60">
                      <summary className="flex cursor-pointer items-center gap-1.5 px-2 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <FileCode2 className="h-3 w-3" /> Payload
                      </summary>
                      <pre className="scrollbar-thin max-h-48 overflow-auto rounded-b-md bg-surface-elevated/60 px-2 py-2 text-[11px] leading-snug text-foreground/90">
{payloadStr}
                      </pre>
                    </details>
                  )}

                  {needsPhrase && (
                    <div className="space-y-1.5 rounded-md border border-warn/30 bg-warn/5 p-2.5">
                      <p className="text-xs text-foreground">
                        This one's high-risk. Type <span className="font-mono font-semibold">approve</span> to confirm.
                      </p>
                      <Input
                        autoFocus
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value)}
                        placeholder="approve"
                      />
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setApprovalTarget(null)}>Cancel</Button>
                  <Button
                    disabled={!phraseOk || busy === t.id}
                    onClick={async () => {
                      await transition(t, "approved", needsPhrase ? "approve" : "reviewed");
                      setApprovalTarget(null);
                    }}
                  >
                    {busy === t.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Confirm approval
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={!!rollbackTarget} onOpenChange={(o) => !o && setRollbackTarget(null)}>
        <DialogContent className="max-w-md">
          {rollbackTarget && (() => {
            const t = rollbackTarget;
            const ok = rollbackText.trim().toLowerCase() === "rollback";
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <RotateCcw className="h-5 w-5 text-warn" />
                    Undo this action
                  </DialogTitle>
                  <DialogDescription className="space-y-2">
                    <span className="block text-sm font-medium text-foreground">{t.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {t.rollback_available
                        ? "Vanta will try to reverse what ran. The receipt stays either way."
                        : "No automatic undo. Marking it 'undone' is just bookkeeping — you'll need to reverse the effect yourself."}
                    </span>
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-1.5 rounded-md border border-warn/30 bg-warn/5 p-2.5">
                  <p className="text-xs text-foreground">
                    Type <span className="font-mono font-semibold">rollback</span> to confirm.
                  </p>
                  <Input autoFocus value={rollbackText} onChange={(e) => setRollbackText(e.target.value)} placeholder="rollback" />
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setRollbackTarget(null)}>Cancel</Button>
                  <Button
                    disabled={!ok || busy === t.id}
                    onClick={async () => {
                      await transition(t, "rolled_back", "user rollback");
                      setRollbackTarget(null);
                    }}
                  >
                    {busy === t.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                    Confirm rollback
                  </Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
