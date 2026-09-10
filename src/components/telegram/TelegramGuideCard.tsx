// TelegramGuideCard — what this chat can and cannot do, in the open.
//
// Reads the same guide the bot answers with, so the page and the chat can never
// drift. Nothing here does anything: it explains, and it hands you a copy.
import { useState } from "react";
import { BookOpen, ChevronDown, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  TELEGRAM_COMMANDS,
  TELEGRAM_GUIDE,
  TELEGRAM_PHRASEBOOK,
  renderTelegramGuideMarkdown,
} from "../../../supabase/functions/_shared/telegram_guide";

export function TelegramGuideCard({ botUsername }: { botUsername?: string | null }) {
  const [open, setOpen] = useState(true);

  const download = () => {
    const blob = new Blob([renderTelegramGuideMarkdown(botUsername)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "echo-on-telegram.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="vanta-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[13px] font-medium">
            <BookOpen className="h-3.5 w-3.5 text-primary" /> How to use this chat
          </div>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            Same Echo as here — same memory, same calendar, same rules. Ask it{" "}
            <span className="text-foreground">“how do I use you”</span> in the chat and it says all of this back.
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={download}>
          <Download className="h-3.5 w-3.5" /> Save a copy
        </Button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 inline-flex min-h-9 items-center gap-1 text-[11.5px] text-primary"
      >
        {open ? "Hide the rundown" : "Read the rundown"}
        <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (open ? "rotate-180" : "")} />
      </button>

      {open && (
        <div className="mt-2 space-y-3">
          {TELEGRAM_GUIDE.map((s) => (
            <div key={s.title}>
              <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">{s.title}</div>
              <ul className="space-y-1">
                {s.lines.map((l) => (
                  <li key={l} className="flex gap-1.5 text-[12px] leading-snug">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                    <span>{l}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Shortcuts</div>
            <ul className="space-y-1">
              {TELEGRAM_COMMANDS.map((c) => (
                <li key={c.cmd} className="text-[12px] leading-snug">
                  <code className="rounded bg-muted/50 px-1 py-0.5 text-[11px]">{c.cmd}</code>{" "}
                  <span className="text-muted-foreground">{c.does}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">Things you can just say</div>
            <div className="flex flex-wrap gap-1.5">
              {TELEGRAM_PHRASEBOOK.map((p) => (
                <span key={p} className="rounded-full bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground">
                  “{p}”
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
