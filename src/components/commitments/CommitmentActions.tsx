import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { CheckCircle2, Clock, X, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { MOTION_STAMPED_DONE, feelMs } from "@/lib/motion";
import { AskAboutButton } from "@/components/ask/AskAboutButton";
import { ConfirmConsequenceDialog } from "@/components/ui/consequence-preview";
import { closeCommitmentConsequence, snoozeCommitmentConsequence, type Consequence } from "@/lib/consequence";

export type CommitmentLike = {
  id: string;
  title?: string | null;
  due_at: string | null;
  remind_at: string | null;
  status?: string;
};

type Props = {
  c: CommitmentLike;
  onChanged?: () => void;
  size?: "sm" | "md";
  /** Show the outcome in words — Done / Not yet / Drop it — instead of icons.
      Used where a person is deciding, not scanning. */
  words?: boolean;
};


/**
 * Shared resolve cluster for a commitment row.
 * Done · Snooze · Dismiss — 32px tap targets, optimistic, audited.
 */
export function CommitmentActions({ c, onChanged, size = "md", words = false }: Props) {
  const { session } = useAuth();
  const [busy, setBusy] = useState<"done" | "snooze" | "drop" | null>(null);
  const [open, setOpen] = useState(false);
  /* Closing a promise and moving one both change the record, so both stop for a
     preview first. Nothing is written until the dialog is confirmed. */
  const [pending, setPending] = useState<
    | { kind: "done"; consequence: Consequence }
    | { kind: "snooze"; consequence: Consequence; at: Date; label: string }
    | null
  >(null);

  /* Closing a promise should be visible: the row it lives in presses down and
     dims for a beat before the list refreshes it away, so the close reads as a
     thing that happened rather than a row that blinked out. */
  const wrap = useRef<HTMLDivElement>(null);
  const stampRow = () => {
    const row = wrap.current?.closest("[data-echo-row], li, .vanta-inset") ?? wrap.current?.parentElement;
    if (row instanceof HTMLElement) row.classList.add(MOTION_STAMPED_DONE);
  };

  const isReminder = !!c.remind_at;
  const tap = words ? "h-8 px-2 gap-1" : size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const word = (t: string) => (words ? <span className="text-[11.5px]">{t}</span> : null);


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

  const askDone = () =>
    setPending({
      kind: "done",
      consequence: closeCommitmentConsequence({
        title: c.title,
        dueAt: c.due_at,
        remindAt: c.remind_at,
        isReminder,
      }),
    });

  const askSnooze = (at: Date, label: string) =>
    setPending({
      kind: "snooze",
      at,
      label,
      consequence: snoozeCommitmentConsequence({
        title: c.title,
        dueAt: c.due_at,
        remindAt: c.remind_at,
        toIso: at.toISOString(),
        presetLabel: label,
      }),
    });

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
    setPending(null);
    stampRow();
    const hold = feelMs(420, { min: 0 });
    if (hold) setTimeout(() => onChanged?.(), hold);
    else onChanged?.();
  };

  const snoozeTo = async (target: Date, label: string) => {
    if (!session || busy) return;
    setBusy("snooze");
    const iso = target.toISOString();
    const shiftDue = !!(c.due_at && new Date(c.due_at).getTime() < Date.now());
    const { error } = await supabase
      .from("commitments")
      .update(shiftDue ? { remind_at: iso, due_at: iso } : { remind_at: iso })
      .eq("id", c.id);
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
    setPending(null);
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
    <div ref={wrap} className="flex shrink-0 items-center gap-1">
      <ConfirmConsequenceDialog
        open={!!pending}
        title={
          pending?.kind === "snooze"
            ? `Move this to ${pending.label}?`
            : isReminder
              ? "Close this reminder?"
              : "Close this promise?"
        }
        consequence={pending?.consequence ?? null}
        confirmLabel={pending?.kind === "snooze" ? "Move it" : "Mark done"}
        busy={!!busy}
        onCancel={() => setPending(null)}
        onConfirm={() => {
          if (!pending) return;
          if (pending.kind === "done") return markDone();
          return snoozeTo(pending.at, pending.label);
        }}
      />
      <AskAboutButton
        kind="commitment"
        id={c.id}
        label={c.title?.trim() || (isReminder ? "Reminder" : "Commitment")}
        question={`Where does “${c.title?.trim() || "this one"}” stand?`}
        size="icon"
      />
      <button
        onClick={askDone}
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
            title="Later"
            aria-label="Later"
            className={cn(btn, tap)}
          >
            {busy === "snooze" ? <Loader2 className={cn(icon, "animate-spin")} /> : <Clock className={icon} />}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" sideOffset={6} className="w-44 p-1">
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">Bring it back</div>
          {snoozeOptions.map((o) => (
            <button
              key={o.label}
              onClick={() => { setOpen(false); askSnooze(o.at, o.label); }}
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
        title="Cancel it"
        aria-label="Cancel it"
        className={cn(btn, tap, "hover:text-danger hover:ring-danger/40")}
      >
        {busy === "drop" ? <Loader2 className={cn(icon, "animate-spin")} /> : <X className={icon} />}
      </button>
    </div>
  );
}
