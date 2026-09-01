// PhysicalLoopPanel — paper and phone, in Work's reading tier.
//
// Three honest lines: the phone that feeds Vanta, the sweep that reads pages,
// and one real promise walked from message to receipt. Nothing here approves
// or executes; the only writes it can trigger are a read and a reminder.
import { useState } from "react";
import { Check, Circle, Loader2, Phone, RefreshCw, Send, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS, MOTION_ROW } from "@/lib/motion";
import { MachineLabel, MachineText } from "@/components/ui/instrument";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { LoadingState, ErrorState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { vantaToast } from "@/lib/vantaVoice";
import { usePhysicalLoop } from "@/hooks/usePhysicalLoop";

export function PhysicalLoopPanel() {
  const { loop, loading, error, refresh } = usePhysicalLoop();
  const [reading, setReading] = useState(false);
  const [sending, setSending] = useState(false);

  const readNow = async () => {
    setReading(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("physical-sweep", { body: {} });
      if (err) throw err;
      const read = Number((data as any)?.read ?? 0);
      const unreadable = Number((data as any)?.unreadable ?? 0);
      const paused = (data as any)?.paused as string | null;
      if (paused) {
        vantaToast.info({ title: "Reading is paused", description: paused });
      } else if (read === 0 && unreadable === 0) {
        vantaToast.info({
          title: "Nothing new to read",
          description: "No pages were waiting. Nothing changed.",
        });
      } else {
        vantaToast.success({
          title: `${read} ${read === 1 ? "page" : "pages"} read`,
          description:
            unreadable > 0
              ? `${unreadable} couldn't be read. Everything landed in your Inbox as a draft.`
              : "They're in your Inbox as drafts, waiting on you.",
        });
      }
      refresh();
    } catch (e) {
      vantaToast.error({
        title: "The read didn't run",
        description: e instanceof Error ? e.message : "Try again in a moment.",
      });
    } finally {
      setReading(false);
    }
  };

  const sendReminder = async () => {
    if (!loop.promise) return;
    setSending(true);
    try {
      const { data, error: err } = await supabase.functions.invoke("reminder-send-now", {
        body: { commitment_id: loop.promise.id },
      });
      if (err) throw err;
      if ((data as any)?.error) throw new Error(String((data as any).error));
      vantaToast.success({
        title: "Reminder sent to your phone",
        description: "Its buttons acknowledge the promise. They don't execute anything.",
      });
      refresh();
    } catch (e) {
      vantaToast.error({
        title: "The reminder didn't send",
        description: e instanceof Error ? e.message : "Check your linked chat.",
      });
    } finally {
      setSending(false);
    }
  };


  return (
    <CollapsibleSection
      title="Paper and phone"
      storageKey="work.physical"
      icon={<Smartphone className="h-3.5 w-3.5" />}
      reading={loop.progress.total ? `${loop.progress.done}/${loop.progress.total}` : undefined}
      defaultOpen={false}
      summary={
        loop.linked
          ? `Paper and phone · ${loop.progress.done} of ${loop.progress.total} steps proved`
          : "Paper and phone · no chat linked yet"
      }
      className="border-dashed"
    >
      {error ? (
        <ErrorState error={error} doing="reading your phone loop" onRetry={refresh} />
      ) : loading ? (
        <LoadingState label="Checking the loop…" />
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Your phone feeds Vanta. It never controls it — everything from a message arrives as a
            draft, and approval happens in here.
          </p>

          {/* The phone */}
          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Phone className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Phone</MachineLabel>
              <MachineText className="text-[10px] text-muted-foreground">
                {loop.linked ? loop.chatLabel ?? "linked" : "not linked"}
              </MachineText>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">
              {loop.lastMessageAt
                ? `Last message in ${loop.lastMessageAt}.`
                : loop.linked
                  ? "Linked, but nothing has come in yet."
                  : "Pair Telegram in Connected Accounts to send captures from your phone."}
            </p>
          </div>

          {/* The sweep */}
          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 text-primary" />
              <MachineLabel className="text-foreground/70">Pages read</MachineLabel>
              <MachineText className="text-[10px] text-muted-foreground">
                {loop.readPages} read · {loop.pendingPages} waiting
              </MachineText>
              <button
                type="button"
                onClick={() => void readNow()}
                disabled={reading}
                className={cn(
                  "ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2",
                  "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground disabled:opacity-60",
                  MOTION_FOCUS,
                )}
              >
                {reading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Read now
              </button>
            </div>
            <p className="mt-1 text-[11.5px] leading-snug text-foreground/90">{loop.sweepLine}</p>
            <AftermathHint text="Photograph a page and send it to your Telegram chat, or drop it in here. Vanta reads it and files it in the Inbox as a draft — it never routes it for you." />

          </div>

          {/* One real promise, walked */}
          <div className="vanta-inset px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <MachineLabel className="text-foreground/70">Walk a promise</MachineLabel>
              <MachineText className="text-[10px] text-muted-foreground">
                {loop.progress.done} of {loop.progress.total} proved
              </MachineText>
              {loop.promise && loop.promise.status === "open" ? (
                <button
                  type="button"
                  onClick={() => void sendReminder()}
                  disabled={sending || !loop.linked}
                  className={cn(
                    "ml-auto inline-flex min-h-[32px] items-center gap-1 rounded-[2px] border border-border/60 px-2",
                    "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground disabled:opacity-60",
                    MOTION_FOCUS,
                  )}
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send the reminder now
                </button>
              ) : null}
            </div>
            <ol className="mt-2 space-y-1.5">
              {loop.steps.map((s, i) => (
                <li
                  key={s.key}
                  className={cn("flex items-start gap-2 rounded-[2px] px-1 py-1", MOTION_ROW)}
                >
                  {s.state === "done" ? (
                    <Check className="mt-[2px] h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-[2px] h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[11.5px] font-medium leading-snug text-foreground">
                      {i + 1}. {s.label}
                    </span>
                    <span className="block text-[11px] leading-snug text-muted-foreground">{s.line}</span>
                  </span>
                </li>
              ))}
            </ol>
            <AftermathHint text="Every line above comes from a recorded event. Nothing here can approve or run anything — the chat buttons only acknowledge a promise." />

          </div>
        </div>
      )}
    </CollapsibleSection>
  );
}
