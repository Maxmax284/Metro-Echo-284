// GoogleAccountSection — one Google account, several explicit permissions.
//
// The container is the account. Each service underneath says what it does and
// whether *you* switched it on. Status comes from your own grants only: the
// builder's workspace connection keeps calendar reads working, but it never
// renders here as "you are connected". Signing in on its own grants nothing.
import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { REACH_LABEL, REACH_TONE } from "@/lib/reach";
import {
  EMPTY_GOOGLE_STATE, GOOGLE_CAPABILITIES, accountLine, accountReach, capabilityReach,
  googleStateFrom, isGranted, isSharedGrant, notOfferableLine, sharedGrantLine, statusFor,
  type GoogleAccountState, type GoogleCapability,
} from "@/lib/googleEcosystem";
import {
  connectGoogleService, disconnectGoogleService, readGoogleAccountStatus,
} from "@/lib/googleServices";
import { MailSweepRow } from "@/components/settings/MailSweepRow";

export function GoogleAccountSection({
  onChanged,
  only,
}: {
  onChanged?: () => void;
  /** Show only these services — lets mail get its own findable home in settings. */
  only?: GoogleCapability["key"][];
}) {
  const { orgId } = useScope();
  const [state, setState] = useState<GoogleAccountState>(EMPTY_GOOGLE_STATE);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState(googleStateFrom(await readGoogleAccountStatus()));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async (cap: GoogleCapability) => {
    if (!cap.connectorId) return;
    setBusy(cap.key);
    try {
      await connectGoogleService(cap.connectorId, orgId ?? null);
      toast.success({
        title: `${cap.label} is on.`,
        description: "Nothing else in your Google account became readable.",
      });
      if (cap.key === "calendar") {
        await supabase.functions.invoke("calendar-sync", { body: {} }).catch(() => null);
      }
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That sign-in did not finish.");
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (cap: GoogleCapability) => {
    if (!cap.connectorId) return;
    setBusy(cap.key);
    try {
      await disconnectGoogleService(cap.connectorId);
      toast.success(
        cap.key === "calendar"
          ? "Calendar disconnected. Its entries went with it."
          : `${cap.label} disconnected.`,
      );
      await load();
      onChanged?.();
    } catch {
      toast.error("Could not disconnect right now.");
    } finally {
      setBusy(null);
    }
  };

  const reach = accountReach(state);
  const anyOn = GOOGLE_CAPABILITIES.some((c) => isGranted(c, state));

  return (
    <div className="mb-3 rounded-lg bg-background/40 p-3 ring-1 ring-border/50">
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
        {anyOn && state.account ? (
          <p className="mt-1 truncate font-mono text-[11px] text-foreground/70">{state.account}</p>
        ) : null}
      </div>

      <ul className="mt-3 space-y-1.5">
        {GOOGLE_CAPABILITIES.map((cap) => {
          const capReach = capabilityReach(cap, state);
          const granted = isGranted(cap, state);
          const offerable = !!statusFor(cap, state)?.offerable;
          const blocked = notOfferableLine(cap, state);
          const shared = sharedGrantLine(cap, state);
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
              {shared ? (
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/80">{shared}</p>
              ) : null}
              {blocked ? (
                <p className="mt-0.5 text-[10.5px] leading-snug text-muted-foreground/80">{blocked}</p>
              ) : null}
              {statusFor(cap, state)?.detail ? (
                <p className="mt-0.5 text-[10.5px] leading-snug text-destructive">
                  {statusFor(cap, state)?.detail}
                </p>
              ) : null}
              {cap.wired && (granted || offerable) ? (
                <Button
                  size="sm"
                  variant={granted ? "ghost" : "default"}
                  className="vanta-focus mt-1.5 h-8 text-[11.5px]"
                  disabled={busy === cap.key}
                  onClick={() => void (granted ? disconnect(cap) : connect(cap))}
                >
                  {granted ? (
                    <>
                      <LogOut className="mr-1.5 h-3.5 w-3.5" />
                      Disconnect
                    </>
                  ) : busy === cap.key ? (
                    "Opening Google…"
                  ) : isSharedGrant(cap, state) ? (
                    "Use my own Google"
                  ) : (
                    `Connect ${cap.label}`
                  )}
                </Button>
              ) : null}
              {/* Reading mail on a tap is one thing. Watching it in the
                  background is a separate, explicit yes. */}
              {cap.key === "gmail" && granted ? <MailSweepRow /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
