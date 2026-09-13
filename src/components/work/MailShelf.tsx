// MailShelf — mail as one conclusion, then a canvas you control.
//
// Doctrine:
//   - Quiet unless something is actually waiting on you. No mail, no shelf. Not
//     connected, no shelf either — Settings owns that conversation.
//   - Echo may offer a starting point when you tap for one. Your words are what
//     go out, and sending is a separate, explicit yes with a receipt.
import { useCallback, useEffect, useState } from "react";
import { Mail, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

type MailItem = {
  id: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  date: string | null;
  snippet: string;
  unread: boolean;
};

type OpenMail = MailItem & {
  text: string;
  messageIdHeader: string | null;
  references: string | null;
};

export function MailShelf() {
  const { orgId } = useScope();
  const [items, setItems] = useState<MailItem[]>([]);
  const [conclusion, setConclusion] = useState<string | null>(null);
  const [open, setOpen] = useState<OpenMail | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<"open" | "compose" | "draft" | "send" | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("gmail-read", { body: {} });
    if (error) return;
    const body = data as { connected?: boolean; items?: MailItem[]; conclusion?: string | null } | null;
    if (!body?.connected) return;
    setItems(body.items ?? []);
    setConclusion(body.conclusion ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openOne = async (item: MailItem) => {
    setBusy("open");
    try {
      const { data, error } = await supabase.functions.invoke("gmail-read", {
        body: { message_id: item.id },
      });
      if (error) throw error;
      const message = (data as { message?: OpenMail } | null)?.message;
      if (!message) throw new Error("no message");
      setOpen({ ...item, ...message });
      setReply("");
    } catch {
      toast.error("Could not open that one.");
    } finally {
      setBusy(null);
    }
  };

  const letEchoStart = async () => {
    if (!open) return;
    setBusy("compose");
    try {
      const { data, error } = await supabase.functions.invoke("gmail-draft", {
        body: { intent: "compose", their_text: open.text, their_name: open.fromName },
      });
      if (error) throw error;
      const suggestion = (data as { suggestion?: string } | null)?.suggestion?.trim();
      if (!suggestion) throw new Error("empty");
      setReply(suggestion);
    } catch {
      toast.error("Echo could not write a starting point. Write it your way.");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!open || !reply.trim()) return;
    setBusy("draft");
    try {
      const { error } = await supabase.functions.invoke("gmail-draft", {
        body: {
          intent: "draft",
          to: open.from,
          subject: open.subject,
          text: reply,
          thread_id: open.threadId,
          in_reply_to: open.messageIdHeader,
          references: open.references,
          organization_id: orgId ?? null,
        },
      });
      if (error) throw error;
      toast.success("Saved in Gmail as a draft. Nothing has been sent.");
    } catch {
      toast.error("Could not save that draft.");
    } finally {
      setBusy(null);
    }
  };

  /* Nothing is sent from here. The words become one approval in Work, and the
     send only happens when a person approves it there — with a receipt. */
  const lineUp = async () => {
    if (!open || !reply.trim()) return;
    setBusy("send");
    try {
      const { data, error } = await supabase.functions.invoke("gmail-draft", {
        body: {
          intent: "send",
          confirmed: true,
          to: open.from,
          their_name: open.fromName,
          subject: open.subject,
          text: reply,
          thread_id: open.threadId,
          in_reply_to: open.messageIdHeader,
          references: open.references,
          organization_id: orgId ?? null,
        },
      });
      if (error) throw error;
      if (!(data as { staged?: boolean } | null)?.staged) throw new Error("not staged");
      toast.success(
        `Ready for your approval in Work. Nothing has gone to ${open.fromName} yet.`,
      );
      setOpen(null);
      await load();
    } catch {
      toast.error("Could not line that up. Nothing left your account.");
    } finally {
      setBusy(null);
    }
  };

  if (!conclusion) return null;

  return (
    <div className="vanta-card p-3">
      <div className="flex items-center gap-2">
        <Mail className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-xs font-medium">Mail waiting on you</h3>
      </div>
      <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">{conclusion}</p>
      <ul className="mt-2 space-y-1.5">
        {items.filter((i) => i.unread).slice(0, 5).map((item) => (
          <li key={item.id}>
            <button
              onClick={() => void openOne(item)}
              disabled={busy === "open"}
              className={cn(
                "vanta-inset flex min-h-[44px] w-full items-start gap-2 px-3 py-2 text-left",
                "hover:bg-muted/30",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{item.fromName}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                  {item.subject}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[85svh] max-w-[92vw] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[13px]">{open?.subject}</DialogTitle>
            <DialogDescription className="text-[11.5px]">
              From {open?.fromName} · {open?.from}
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <>
              <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/20 p-2 text-[11.5px] leading-relaxed text-muted-foreground">
                {open.text.slice(0, 4000) || open.snippet}
              </p>
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write your reply. Whatever is here is exactly what gets sent."
                className="min-h-28 text-[12.5px]"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="vanta-focus h-9 text-[11.5px]"
                  disabled={busy === "compose"}
                  onClick={() => void letEchoStart()}
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {busy === "compose" ? "Writing…" : "Let Echo start it"}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="vanta-focus h-9 text-[11.5px]"
                  disabled={!reply.trim() || busy === "draft"}
                  onClick={() => void save()}
                >
                  Save as draft
                </Button>
                <Button
                  size="sm"
                  className="vanta-focus h-9 text-[11.5px]"
                  disabled={!reply.trim() || busy === "send"}
                  onClick={() => void send()}
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  {busy === "send" ? "Sending…" : "Send it"}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
