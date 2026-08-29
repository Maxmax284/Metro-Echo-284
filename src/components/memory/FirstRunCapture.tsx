// FirstRunCapture — the four doors into Vanta, shown once the desk is empty.
//
// Doctrine: an empty state teaches. This panel does not report emptiness; it
// names every way something can arrive, and tells the truth about which doors
// are actually open (email address minted, Telegram linked) versus not yet.
// It never executes anything and never captures on the user's behalf.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Keyboard, Mail, Send, Upload, Check } from "lucide-react";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { cn } from "@/lib/utils";

type Door = {
  key: string;
  label: string;
  how: string;
  Icon: typeof Mail;
  ready: boolean;
  hint?: string;
};

export function FirstRunCapture({ className }: { className?: string }) {
  const { user } = useAuth();
  const [emailSlug, setEmailSlug] = useState<string | null>(null);
  const [telegram, setTelegram] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const [{ data: addr }, { data: chat }] = await Promise.all([
        supabase.from("email_inbound_addresses").select("slug").eq("user_id", user.id).maybeSingle(),
        supabase.from("telegram_chat_links").select("chat_id").eq("user_id", user.id).limit(1),
      ]);
      if (!alive) return;
      setEmailSlug(addr?.slug ?? null);
      setTelegram((chat ?? []).length > 0);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  const doors: Door[] = [
    {
      key: "type",
      label: "Type it here",
      how: "Use Capture at the bottom of Today. Fastest door, always open.",
      Icon: Keyboard,
      ready: true,
    },
    {
      key: "upload",
      label: "Upload a file",
      how: "Drop a PDF, image or doc in Inbox → Files. Vanta reads it, then waits.",
      Icon: Upload,
      ready: true,
    },
    {
      key: "email",
      label: "Forward an email",
      how: emailSlug
        ? `Your inbound address is live (${emailSlug}@inbound.vanta). Forward anything to it.`
        : "Mint your inbound address in Settings → Integrations, then forward mail to it.",
      Icon: Mail,
      ready: Boolean(emailSlug),
      hint: emailSlug ? undefined : "Not set up yet",
    },
    {
      key: "telegram",
      label: "Message Telegram",
      how: telegram
        ? "Telegram is linked. Anything you send lands here as a draft."
        : "Link Telegram in Settings → Integrations to send notes from your phone.",
      Icon: Send,
      ready: telegram,
      hint: telegram ? undefined : "Not linked yet",
    },
  ];

  return (
    <div className={cn("rounded-md border border-dashed border-border/60 p-3", className)}>
      <p className="text-[12px] font-medium text-foreground">Nothing has arrived yet. Here is how things get in.</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Every door drops a draft on this desk. Nothing runs on its own — you decide what becomes a note,
        a promise, or an action.
      </p>
      <ul className="mt-2.5 space-y-2">
        {doors.map((d) => {
          const Icon = d.Icon;
          return (
            <li key={d.key} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-surface-elevated/40">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                  {d.label}
                  {d.ready ? (
                    <Check className="h-3 w-3 text-primary" aria-label="Open" />
                  ) : (
                    <span className="rounded-full border border-border/60 px-1.5 py-px text-[9.5px] font-normal text-muted-foreground">
                      {d.hint}
                    </span>
                  )}
                </p>
                <p className="text-[10.5px] leading-snug text-muted-foreground">{d.how}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <AftermathHint text="Whatever arrives waits here as a draft · you route it, and Receipts keeps the trail" />
    </div>
  );
}
