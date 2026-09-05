// FirstRunCapture — the three ways in, shown once the desk is empty.
//
// Doctrine: an empty state teaches. This panel does not report emptiness; it
// names every way something can arrive, tells the truth about which doors are
// actually open (email address minted, Telegram linked), and recommends the
// fastest one for a first-time user. It never executes anything and never
// captures on the user's behalf.
//
// Keyboard: the three paths are one focus stop (roving tabindex). Arrow keys
// move between them, Enter or Space follows the highlighted path. The
// recommended path holds focus first, so a keyboard user starts where we
// would have pointed them anyway.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Keyboard, Smartphone, Upload, Check } from "lucide-react";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

type Path = {
  key: string;
  label: string;
  how: string;
  Icon: typeof Keyboard;
  ready: boolean;
  /** Shown instead of the open tick when the door is not connected yet. */
  hint?: string;
  /** Where the tap goes. Opening a setup screen is the only navigation here. */
  href?: string;
  recommended?: boolean;
};

export function FirstRunCapture({ className }: { className?: string }) {
  const { user } = useAuth();
  const [emailSlug, setEmailSlug] = useState<string | null>(null);
  const [telegram, setTelegram] = useState(false);
  const [cursor, setCursor] = useState(0);
  const itemRefs = useRef<(HTMLElement | null)[]>([]);

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

  /* The phone door is one path with an honest sub-line: whichever of Telegram
     or a forwarding address is actually live. Two half-connected doors read as
     failure; one path with a status reads as a choice. */
  const phoneHow = telegram && emailSlug
    ? `Telegram is linked, and mail forwarded to ${emailSlug}@inbound.vanta lands here too.`
    : telegram
      ? "Telegram is linked. Anything you send it arrives here as a draft."
      : emailSlug
        ? `Forward any email to ${emailSlug}@inbound.vanta and it arrives here as a draft.`
        : "Not connected yet. Link Telegram or mint a forwarding address in Settings, then send from anywhere.";

  const paths: Path[] = [
    {
      key: "type",
      label: "Type it here",
      how: "Use Capture at the bottom of Today. Fastest way in, always open.",
      Icon: Keyboard,
      ready: true,
      recommended: true,
    },
    {
      key: "upload",
      label: "Upload a file",
      how: "Drop a PDF, image or document in Inbox. Echo reads it, then waits for you.",
      Icon: Upload,
      ready: true,
    },
    {
      key: "phone",
      label: "Send it from your phone",
      how: phoneHow,
      Icon: Smartphone,
      ready: telegram || Boolean(emailSlug),
      hint: telegram || emailSlug ? undefined : "Not connected yet",
      href: telegram || emailSlug ? undefined : "/settings/integrations",
    },
  ];

  /* Start on the recommended path, so the first Tab lands somewhere useful. */
  useEffect(() => {
    const rec = paths.findIndex((p) => p.recommended);
    if (rec >= 0) setCursor(rec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function move(delta: number) {
    const next = (cursor + delta + paths.length) % paths.length;
    setCursor(next);
    itemRefs.current[next]?.focus();
  }

  return (
    <div className={cn("rounded-md border border-dashed border-border/60 p-3", className)}>
      <p className="text-[12px] font-medium text-foreground">Nothing has arrived yet. Three ways in.</p>
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
        Every path drops a draft on this desk. Nothing runs on its own — you decide what becomes a note,
        a promise, or an action. New here? Start with the first one.
      </p>

      <ul
        className="mt-2.5 space-y-2"
        role="listbox"
        aria-label="Ways to get something into Metro Echo"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.preventDefault();
            move(1);
          } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
            e.preventDefault();
            move(-1);
          }
        }}
      >
        {paths.map((p, i) => {
          const Icon = p.Icon;
          const selected = i === cursor;
          const body = (
            <>
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border/60 bg-surface-elevated/40">
                <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-medium text-foreground">
                  {p.label}
                  {p.recommended && (
                    <span className="rounded-full border border-primary/40 px-1.5 py-px text-[9.5px] font-normal uppercase tracking-wider text-primary">
                      Start here
                    </span>
                  )}
                  {p.ready ? (
                    <Check className="h-3 w-3 text-primary" aria-label="Open" />
                  ) : (
                    <span className="rounded-full border border-border/60 px-1.5 py-px text-[9.5px] font-normal text-muted-foreground">
                      {p.hint}
                    </span>
                  )}
                </span>
                <span className="block text-[10.5px] leading-snug text-muted-foreground">{p.how}</span>
                {p.href && (
                  <span className="mt-0.5 block text-[10.5px] text-primary">Open Settings to connect it</span>
                )}
              </span>
            </>
          );

          const shared = cn(
            "flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1 text-left",
            selected && "bg-surface-elevated/40",
            MOTION_FOCUS,
          );

          return (
            <li key={p.key} role="option" aria-selected={selected}>
              {p.href ? (
                <a
                  href={p.href}
                  ref={(el) => { itemRefs.current[i] = el; }}
                  tabIndex={selected ? 0 : -1}
                  onFocus={() => setCursor(i)}
                  className={shared}
                >
                  {body}
                </a>
              ) : (
                <div
                  ref={(el) => { itemRefs.current[i] = el; }}
                  tabIndex={selected ? 0 : -1}
                  onFocus={() => setCursor(i)}
                  className={shared}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <AftermathHint text="Whatever arrives waits here as a draft · you route it, and Receipts keeps the trail" />
    </div>
  );
}
