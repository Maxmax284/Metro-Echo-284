// GoogleAccountSection — one Google account, several explicit permissions.
//
// The container is the account. Each service underneath says what it does and
// whether Echo can actually do it. Nothing is listed as ready unless the wiring
// behind it exists, and signing in on its own grants nothing.
import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { REACH_LABEL, REACH_TONE } from "@/lib/reach";
import {
  GOOGLE_CAPABILITIES, accountLine, accountReach, capabilityReach,
  type GoogleAccountState,
} from "@/lib/googleEcosystem";
import {
  connectGoogleCalendar, disconnectGoogleCalendar, readCalendarWriteState,
} from "@/lib/googleCalendarLink";

const EMPTY: GoogleAccountState = { signedIn: false, account: null, granted: [] };

export function GoogleAccountSection({ onChanged }: { onChanged?: () => void }) {
  const { orgId } = useScope();
  const [state, setState] = useState<GoogleAccountState>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const write = await readCalendarWriteState();
    const { data } = await supabase
      .from("calendar_feeds")
      .select("label, last_error")
      .eq("provider", "google")
      .limit(1)
      .maybeSingle();
    const row = data as { label?: string; last_error?: string | null } | null;
    const signedIn = write === "connected";
    setState({
      signedIn,
      account: row?.label ?? null,
      granted: signedIn ? ["calendar"] : [],
      failing: signedIn && row?.last_error ? ["calendar"] : [],
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    try {
      await connectGoogleCalendar(orgId ?? null);
      toast.success({
        title: "Google connected.",
        description: "Calendar is on. Nothing else in your account is readable.",
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
      toast.success("Google disconnected. Its entries went with it.");
      await load();
      onChanged?.();
    } catch {
      toast.error("Could not disconnect right now.");
    } finally {
      setBusy(false);
    }
  };

  const reach = accountReach(state);

  return (
    <div className="mb-3 rounded-lg bg-background/40 p-3 ring-1 ring-border/50">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-medium">Google</span>
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                REACH_TONE[reach],
              )}
            >
              {REACH_LABEL[reach]}
            </span>
          </div>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            {accountLine(state)}
          </p>
          {state.signedIn && state.account ? (
            <p className="mt-1 truncate font-mono text-[11px] text-foreground/70">{state.account}</p>
          ) : null}
        </div>
        {state.signedIn ? (
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

      <ul className="mt-3 space-y-1.5">
        {GOOGLE_CAPABILITIES.map((cap) => {
          const capReach = capabilityReach(cap, state);
          return (
            <li key={cap.key} className="rounded-md bg-muted/20 p-2 ring-1 ring-border/30">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 text-[12px] font-medium">{cap.label}</span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] uppercase tracking-wider ring-1",
                    cap.wired ? REACH_TONE[capReach] : "bg-muted/40 text-muted-foreground ring-border/60",
                  )}
                >
                  {cap.wired ? REACH_LABEL[capReach] : "Not built yet"}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{cap.what}</p>
              {!cap.wired && cap.blocker ? (
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/80">{cap.blocker}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
