// TelegramQuickConnect — the one obvious door to Telegram, pinned at the top of
// the control room. It says the truth (linked or not) and is a full-width tap
// target on a 384px screen. It connects nothing itself; it opens the setup page.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export function TelegramQuickConnect() {
  const { user } = useAuth();
  const [linked, setLinked] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("telegram_chat_links")
        .select("chat_id")
        .eq("user_id", user.id)
        .limit(1);
      if (alive) setLinked((data ?? []).length > 0);
    })();
    return () => { alive = false; };
  }, [user?.id]);

  return (
    <Link
      to="/settings/telegram"
      className="vanta-focus group mb-3 flex min-h-[64px] items-center gap-3 rounded-xl surface-elevated p-3.5 ring-1 ring-primary/30 transition-colors hover:bg-surface-elevated hover:ring-primary/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
        <MessageSquare className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">
          {linked ? "Telegram is connected" : "Connect Telegram"}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
          {linked === null
            ? "Checking your phone link…"
            : linked
              ? "Pair another chat, send a test, see what landed."
              : "Pair your phone in two taps, then send anything from anywhere."}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
