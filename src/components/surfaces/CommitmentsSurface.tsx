import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Bell, AlertTriangle, Loader2 } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { formatDistanceToNow, formatDistanceToNowStrict, isPast } from "date-fns";
import { generateEmbedding } from "@/lib/embeddings";
import { cn } from "@/lib/utils";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { formatTzLine } from "@/lib/timeRules";
import { CommitmentActions } from "@/components/commitments/CommitmentActions";

type Commitment = {
  id: string;
  summary: string;
  due_at: string | null;
  remind_at: string | null;
  last_reminded_at: string | null;
  priority: string;
  status: "open" | "done" | "cancelled";
  created_at: string;
};

const PRIORITIES = ["low", "normal", "high"] as const;

export function CommitmentsSurface() {
  const { session } = useAuth();
  const { timezone } = useUserTimezone();
  const [items, setItems] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState({ summary: "", due_at: "", priority: "normal" });
  const [filter, setFilter] = useState<"open" | "all">("open");

  const refresh = async () => {
    setLoading(true);
    let q = supabase
      .from("commitments")
      .select("id, summary, due_at, remind_at, last_reminded_at, priority, status, created_at")
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(200);
    if (filter === "open") q = q.eq("status", "open");
    const { data } = await q;
    setItems((data ?? []) as Commitment[]);
    setLoading(false);
  };

  useEffect(() => { if (session) refresh(); }, [session, filter]);

  const create = async () => {
    if (!session || !draft.summary.trim()) return;
    const remindAt = draft.due_at
      ? new Date(new Date(draft.due_at).getTime() - 24 * 60 * 60 * 1000).toISOString()
      : null;
    const { data } = await supabase
      .from("commitments")
      .insert({
        user_id: session.user.id,
        summary: draft.summary.trim(),
        due_at: draft.due_at ? new Date(draft.due_at).toISOString() : null,
        remind_at: remindAt,
        priority: draft.priority,
      })
      .select("id")
      .single();
    if (data) {
      generateEmbedding("commitment", data.id);
      toast.success(vantaSay.commitmentAdded());
      setDraft({ summary: "", due_at: "", priority: "normal" });
      setComposing(false);
      refresh();
    }
  };

  const audit = async (commitmentId: string, event: string, payload: Record<string, any> = {}) => {
    if (!session) return;
    await supabase.from("audit_log").insert({
      user_id: session.user.id,
      entity_type: "commitment",
      entity_id: commitmentId,
      event,
      payload,
    });
  };

  const isReminder = (c: Commitment) => !!c.remind_at;

  const complete = async (id: string) => {
    const c = items.find((x) => x.id === id);
    await supabase.from("commitments").update({ status: "done" }).eq("id", id);
    setItems((p) => p.map((x) => (x.id === id ? { ...x, status: "done" } : x)));
    await audit(id, c && isReminder(c) ? "reminder.completed" : "commitment.completed");
    toast.success({ title: vantaSay.markedDone() });
  };

  const snooze = async (c: Commitment) => {
    const base = c.due_at ? new Date(c.due_at) : new Date();
    const next = new Date(base.getTime() + 24 * 3600 * 1000).toISOString();
    await supabase.from("commitments").update({ due_at: next, remind_at: next }).eq("id", c.id);
    await audit(c.id, isReminder(c) ? "reminder.snoozed" : "commitment.snoozed", { until: next });
    toast.success({ title: vantaSay.snoozed("tomorrow") });
    refresh();
  };

  const drop = async (id: string) => {
    await supabase.from("commitments").update({ status: "cancelled" }).eq("id", id);
    await audit(id, "commitment.dropped");
    refresh();
  };

  const overdueCount = items.filter((c) => c.status === "open" && c.due_at && isPast(new Date(c.due_at))).length;
  const dueSoonCount = items.filter((c) => {
    if (c.status !== "open" || !c.due_at) return false;
    const d = new Date(c.due_at).getTime() - Date.now();
    return d > 0 && d < 24 * 60 * 60 * 1000;
  }).length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Commitments</h2>
          <p className="text-xs text-muted-foreground">What you've promised. What's coming due.</p>
        </div>
        <Button size="sm" onClick={() => setComposing(true)} className="gap-1">
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>

      <div className="flex items-center gap-2 px-4 pb-2 text-[11px]">
        {overdueCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-danger/15 px-2 py-0.5 text-danger ring-1 ring-danger/40">
            <AlertTriangle className="h-3 w-3" /> {overdueCount} overdue
          </span>
        )}
        {dueSoonCount > 0 && (
          <span className="flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-warn ring-1 ring-warn/40">
            <Bell className="h-3 w-3" /> {dueSoonCount} due soon
          </span>
        )}
        <div className="ml-auto flex gap-1">
          {(["open", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-2 py-0.5 transition-colors",
                filter === f ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {composing && (
        <div className="mx-4 mb-3 space-y-2 rounded-xl glass p-3 animate-slide-up">
          <Input
            placeholder="What did you commit to?"
            value={draft.summary}
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
          <div className="flex flex-wrap gap-2">
            <Input
              type="datetime-local"
              value={draft.due_at}
              onChange={(e) => setDraft({ ...draft, due_at: e.target.value })}
              className="flex-1 min-w-[180px]"
            />
            <select
              value={draft.priority}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              className="rounded-md bg-input px-2 text-xs text-foreground ring-1 ring-border/60"
            >
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setComposing(false)}>Cancel</Button>
            <Button size="sm" onClick={create}>Save</Button>
          </div>
        </div>
      )}

      <div className="scrollbar-thin flex-1 overflow-y-auto px-4 pb-24">
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">No commitments. Quiet runway.</div>
        ) : (
          <ul className="space-y-2">
            {items.map((c) => {
              const overdue = c.status === "open" && c.due_at && isPast(new Date(c.due_at));
              return (
                <li
                  key={c.id}
                  className={cn(
                    "rounded-xl surface-elevated p-3 ring-1 transition",
                    c.status !== "open" ? "opacity-50 ring-border/60" : overdue ? "ring-danger/50" : "ring-border/60"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm", c.status === "done" && "line-through")}>{c.summary}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-muted-foreground">
                        {c.due_at && (
                          <span className={cn("flex flex-wrap items-baseline gap-x-1.5", overdue && "text-danger")}>
                            <span>{overdue ? "overdue " : "due "}{formatDistanceToNowStrict(new Date(c.due_at), { addSuffix: true })}</span>
                            <span className="text-muted-foreground/70">· {formatTzLine(new Date(c.due_at), timezone)}</span>
                          </span>
                        )}
                        {c.priority !== "normal" && <span className="uppercase tracking-wider">{c.priority}</span>}
                        {c.last_reminded_at && (
                          <span className="flex items-center gap-1"><Bell className="h-2.5 w-2.5" /> reminded {formatDistanceToNow(new Date(c.last_reminded_at), { addSuffix: true })}</span>
                        )}
                        {c.status === "done" && <span className="uppercase tracking-wider text-signal">done</span>}
                        {c.status === "cancelled" && <span className="uppercase tracking-wider">dismissed</span>}
                      </div>
                    </div>
                    {c.status === "open" && (
                      <CommitmentActions c={c} onChanged={refresh} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
