import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, Clock, X, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

export type CommitmentLike = {
  id: string;
  due_at: string | null;
  remind_at: string | null;
  status?: string;
};

type Props = {
  c: CommitmentLike;
  onChanged?: () => void;
  size?: "sm" | "md";
};

/**
 * Shared resolve cluster for a commitment row.
 * Done · Snooze · Dismiss — 32px tap targets, optimistic, audited.
 */
export function CommitmentActions({ c, onChanged, size = "md" }: Props) {
  const { session } = useAuth();
  const [busy, setBusy] = useState<"done" | "snooze" | "drop" | null>(null);
  const [open, setOpen] = useState(false);

  const isReminder = !!c.remind_at;
  const tap = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const audit = async (event: string, payload: Record<string, any> = {}) => {
    if (!session) return;
    await supabase.from("audit_log").insert({
      user_id: session.user.id,
      entity_type: "commitment",
      entity_id: c.id,
      event,
      payload: { ...payload, at: new Date().toISOString() },
    });
  };

  const markDone = async () => {
    if (!session || busy) return;
    setBusy("done");
    const { error } = await supabase.from("commitments").update({ status: "done" }).eq("id", c.id);
    if (error) {
      toast.fromError(error);
      setBusy(null);
      return;
    }
    await audit(isReminder ? "reminder.completed" : "commitment.completed");
    toast.success({ title: vantaSay.markedDone() });
    setBusy(null);
    onChanged?.();
  };

  const snoozeTo = async (target: Date, label: string) => {
    if (!session || busy) return;
    setBusy("snooze");
    const iso = target.toISOString();
    const patch: Record<string, any> = { remind_at: iso };
    if (c.due_at && new Date(c.due_at).getTime() < Date.now()) patch.due_at = iso;
    const { error } = await supabase.from("commitments").update(patch).eq("id", c.id);
    if (error) {
      toast.fromError(error);
      setBusy(null);
      return;
    }
    await audit(isReminder ? "reminder.snoozed" : "commitment.snoozed", {
      from: c.due_at || c.remind_at,
      to: iso,
      preset: label,
    });
    toast.success({ title: vantaSay.snoozed(label) });
    setBusy(null);
    setOpen(false);
    onChanged?.();
  };

  const dismiss = async () => {
    if (!session || busy) return;
    setBusy("drop");
    const { error } = await supabase.from("commitments").update({ status: "cancelled" }).eq("id", c.id);
    if (error) {
      toast.fromError(error);
      setBusy(null);
      return;
    }
    await audit("commitment.cancelled");
    toast.success({ title: vantaSay.cancelled() });
    setBusy(null);
    onChanged?.();
  };

  const btn = "inline-flex items-center justify-center rounded-md text-muted-foreground ring-1 ring-border/50 bg-surface-elevated/60 hover:text-foreground hover:ring-border transition";

  const snoozeOptions = (() => {
    const now = new Date();
    const plus1h = new Date(now.getTime() + 60 * 60 * 1000);
    const tonight = new Date(now); tonight.setHours(20, 0, 0, 0);
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(9, 0, 0, 0);
    const inWeek = new Date(now); inWeek.setDate(inWeek.getDate() + 7); inWeek.setHours(9, 0, 0, 0);
    return [
      { label: "+1 hour", at: plus1h },
      { label: "Tonight 8pm", at: tonight, hide: tonight.getTime() <= now.getTime() },
      { label: "Tomorrow 9am", at: tomorrow },
      { label: "Next week", at: inWeek },
    ].filter((o) => !o.hide);
  })();

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={markDone}
        disabled={!!busy}
        title="Mark done"
        aria-label="Mark done"
        className={cn(btn, tap, "hover:text-signal hover:ring-signal/40")}
      >
        {busy === "done" ? <Loader2 className={cn(icon, "animate-spin")} /> : <CheckCircle2 className={icon} />}
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={!!busy}
            title="Snooze"
            aria-label="Snooze"
            className={cn(btn, tap)}
          >
            {busy === "snooze" ? <Loader2 className={cn(icon, "animate-spin")} /> : <Clock className={icon} />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Snooze until</div>
          {snoozeOptions.map((o) => (
            <button
              key={o.label}
              onClick={() => snoozeTo(o.at, o.label)}
              className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
            >
              {o.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>
      <button
        onClick={dismiss}
        disabled={!!busy}
        title="Dismiss"
        aria-label="Dismiss"
        className={cn(btn, tap, "hover:text-danger hover:ring-danger/40")}
      >
        {busy === "drop" ? <Loader2 className={cn(icon, "animate-spin")} /> : <X className={icon} />}
      </button>
    </div>
  );
}
