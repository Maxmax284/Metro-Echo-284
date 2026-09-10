// GoogleCalendarConnectCard — sign in with your own Google account.
//
// This is the difference between Echo watching a calendar and Echo being able to
// change one. Connected still means nothing moves without approval: a change is
// staged, you say yes, and the receipt proves the write afterwards.
import { useCallback, useEffect, useState } from "react";
import { CalendarCheck2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { useScope } from "@/hooks/useScope";
import { supabase } from "@/integrations/supabase/client";
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  readCalendarWriteState,
  type CalendarWriteState,
} from "@/lib/googleCalendarLink";

export function GoogleCalendarConnectCard({ onChanged }: { onChanged?: () => void }) {
  const { orgId } = useScope();
  const [state, setState] = useState<CalendarWriteState | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setState(await readCalendarWriteState());
    const { data } = await supabase
      .from("calendar_feeds")
      .select("label")
      .eq("provider", "google")
      .limit(1)
      .maybeSingle();
    setAccount((data as { label?: string } | null)?.label ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      await connectGoogleCalendar(orgId ?? null);
      toast.success({
        title: "Google Calendar connected.",
        description: "Echo reads what Google holds, and can change it once you approve.",
      });
      await supabase.functions.invoke("calendar-sync", { body: {} }).catch(() => null);
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That sign-in did not finish.");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await disconnectGoogleCalendar();
      toast.success("Google Calendar disconnected. Its entries went with it.");
      await load();
      onChanged?.();
    } catch {
      toast.error("Could not disconnect right now.");
    } finally {
      setBusy(false);
    }
  };

  const connected = state === "connected";

  return (
    <div className="mb-3 rounded-lg bg-background/40 p-3 ring-1 ring-border/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[13px] font-medium">
            <CalendarCheck2 className="h-4 w-4 text-muted-foreground" />
            Sign in with Google
          </div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {connected
              ? "Your Google calendar is connected. Echo reads it directly, and can move or add something once you approve the exact change — here or from Telegram."
              : "Connect your own Google account and Echo reads your real calendar instead of a copy. Changes still wait for your yes; nothing moves on its own."}
          </p>
          {connected && account && (
            <p className="mt-1 truncate font-mono text-[11px] text-foreground/70">{account}</p>
          )}
        </div>
        {connected ? (
          <Button
            size="sm"
            variant="ghost"
            className="vanta-focus h-8 shrink-0 text-[11.5px]"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            <LogOut className="mr-1.5 h-3.5 w-3.5" />
            Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            className="vanta-focus h-8 shrink-0 text-[11.5px]"
            disabled={busy}
            onClick={() => void connect()}
          >
            {busy ? "Opening Google…" : "Connect Google"}
          </Button>
        )}
      </div>
    </div>
  );
}
