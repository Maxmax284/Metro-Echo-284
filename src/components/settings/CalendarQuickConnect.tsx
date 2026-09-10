// CalendarQuickConnect — the calendar deserves the same front door as Telegram.
//
// It states the truth (connected to Google, watching a link, or nothing yet) and
// opens the one place where calendars are set up. It connects nothing itself.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type FeedState = "loading" | "google" | "link_only" | "none";

export function CalendarQuickConnect() {
  const { user } = useAuth();
  const [state, setState] = useState<FeedState>("loading");

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("calendar_feeds")
        .select("provider")
        .eq("user_id", user.id)
        .eq("active", true)
        .limit(20);
      if (!alive) return;
      const rows = (data ?? []) as { provider: string | null }[];
      if (rows.some((r) => r.provider === "google")) setState("google");
      else if (rows.length > 0) setState("link_only");
      else setState("none");
    })();
    return () => {
      alive = false;
    };
  }, [user?.id]);

  const line =
    state === "loading"
      ? "Checking your calendar…"
      : state === "google"
        ? "Signed in with Google. Echo can change a day once you approve it."
        : state === "link_only"
          ? "Watching a calendar link. Sign in with Google to allow approved changes."
          : "Sign in with Google, or paste a calendar link if you prefer reading only.";

  return (
    <Link
      to="/settings/g/time"
      className="vanta-focus group mb-3 flex min-h-[64px] items-center gap-3 rounded-xl surface-elevated p-3.5 ring-1 ring-primary/30 transition-colors hover:bg-surface-elevated hover:ring-primary/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
        <CalendarClock className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium">
          {state === "google" ? "Your calendar is connected" : "Connect your calendar"}
        </span>
        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{line}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
