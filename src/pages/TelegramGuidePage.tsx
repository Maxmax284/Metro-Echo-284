// TelegramGuidePage — one findable page that says exactly what the chat does.
//
// Same words as /help, because both read the shared guide. Nothing here acts:
// it explains, and it hands you a file you can pass to someone else.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { TelegramGuideCard } from "@/components/telegram/TelegramGuideCard";

export default function TelegramGuidePage() {
  const [bot, setBot] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void supabase.functions
      .invoke("telegram-status")
      .then(({ data }) => {
        if (alive) setBot(((data as { bot?: { username?: string | null } } | null)?.bot?.username) ?? null);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 pt-6">
      <header className="mb-4 flex items-center gap-3">
        <Link
          to="/settings/g/connections"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-lg font-semibold tracking-tight">What the chat can do</h1>
          <p className="text-xs text-muted-foreground">
            Every file type, every limit, and what only gets finished here. Save a copy to hand to someone else.
          </p>
        </div>
      </header>

      <TelegramGuideCard botUsername={bot} />

      <Link
        to="/settings/telegram"
        className="mt-3 flex items-center gap-2 rounded-xl surface-elevated p-3 text-[12px] ring-1 ring-border/60 hover:bg-muted/20"
      >
        <MessageSquare className="h-4 w-4 text-primary" />
        <span>
          Set the chat up, pair your phone, and watch messages land
          <span className="block text-[11px] text-muted-foreground">Settings → Telegram</span>
        </span>
      </Link>
    </div>
  );
}
