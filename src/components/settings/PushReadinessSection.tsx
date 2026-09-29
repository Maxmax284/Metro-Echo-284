import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff, ShieldAlert, Info, Loader2, Check, X, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import {
  getDiagnostics,
  pushSupported,
  subscribeToPush,
  unsubscribeFromPush,
  type PushDiagnostics,
} from "@/lib/pushClient";

type RowKind = "ok" | "warn" | "err" | "idle";
type Row = { kind: RowKind; label: string; detail?: string };

/**
 * Push readiness — 5 honest status rows. Never claims "On" unless every axis is green.
 */
export function PushReadinessSection() {
  const { user } = useAuth();
  const [diag, setDiag] = useState<PushDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getDiagnostics();
      setDiag(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const audit = async (event: string, payload: Record<string, any> = {}) => {
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_id: user.id, entity_type: "push", event, payload,
    });
  };

  const enable = async () => {
    if (!user) return;
    setBusy(true);
    await audit("push.permission_requested");
    try {
      const r = await subscribeToPush(user.id);
      if (r.ok) {
        await audit("push.permission_granted");
        toast.success("Push is ready. Reminders will land here too.");
      } else if (r.status === "blocked") {
        await audit("push.permission_denied");
        toast("Your browser blocked notifications. Change that in browser settings.");
      } else if (r.status === "needs-config") {
        toast("Push isn't configured on the server yet.");
      } else if (r.status === "unsupported") {
        toast("Push isn't supported in this browser.");
      } else {
        toast("Push wasn't enabled. You can try again.");
      }
      await refresh();
    } catch {
      toast("Couldn't enable push. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const reEnable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await unsubscribeFromPush(user.id);
      const r = await subscribeToPush(user.id);
      if (r.ok) toast.success("Push re-enabled on this device.");
      else toast("Couldn't re-enable. Try toggling browser permission.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await unsubscribeFromPush(user.id);
      toast("Push turned off. Telegram and in-app still work.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  if (!pushSupported()) {
    return (
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <Header status="off" />
        {isIosNotInstalled() ? <IosInstallGuidance /> : (
          <Hint icon={<Info className="h-4 w-4" />}>
            Push reminders aren't supported in this browser.
          </Hint>
        )}
      </section>
    );
  }

  const rows: Row[] = buildRows(diag);
  const allGreen = !!diag?.allGreen;
  const headerStatus: "ready" | "off" | "blocked" | "needs-config" =
    diag?.permission === "denied" ? "blocked"
    : !diag?.vapidConfigured ? "needs-config"
    : allGreen ? "ready"
    : "off";

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <Header status={headerStatus} loading={loading} onRefresh={refresh} />

      {isIosNotInstalled() && !allGreen && <IosInstallGuidance />}

      <ul className="mt-3 space-y-1.5">
        {rows.map((r, i) => <RowItem key={i} row={r} />)}
      </ul>

      <div className="mt-3 space-y-2">
        {diag?.staleSubscription && (
          <Button size="sm" className="w-full gap-2" disabled={busy} onClick={reEnable}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-enable push on this device
          </Button>
        )}

        {!allGreen && !diag?.staleSubscription && diag?.permission !== "denied" && diag?.vapidConfigured && (
          <Button size="lg" className="w-full gap-2" disabled={busy} onClick={enable}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
            Enable push reminders
          </Button>
        )}

        {diag?.permission === "denied" && (
          <Hint icon={<ShieldAlert className="h-4 w-4 text-warn" />}>
            Browser permission is blocked. Change it in browser settings, then refresh.
          </Hint>
        )}

        {!diag?.vapidConfigured && (
          <Hint icon={<ShieldAlert className="h-4 w-4 text-warn" />}>
            Server isn't configured for push yet. Once VAPID keys are set, this goes live.
          </Hint>
        )}

        {allGreen && (
          <>
            <p className="text-[11px] text-muted-foreground">
              All five checks green. The <span className="text-foreground">Test a pulse</span> button below,
              under Quiet hours and channels, proves the whole rail end to end.
            </p>
            <Button size="sm" variant="outline" className="w-full" disabled={busy} onClick={disable}>
              Turn off on this device
            </Button>
          </>
        )}
      </div>
    </section>
  );
}

function buildRows(d: PushDiagnostics | null): Row[] {
  if (!d) return [];
  const permKind: RowKind =
    d.permission === "granted" ? "ok"
    : d.permission === "denied" ? "err"
    : "idle";
  const permLabel =
    d.permission === "granted" ? "Browser permission granted"
    : d.permission === "denied" ? "Browser blocked notifications"
    : "Browser permission not asked yet";

  const swKind: RowKind = d.swRegistered ? "ok" : "warn";
  const subKind: RowKind =
    d.subscriptionLocal && d.subscriptionStored ? "ok"
    : d.subscriptionLocal ? "warn"
    : "idle";
  const subLabel =
    d.subscriptionLocal && d.subscriptionStored ? "Subscription valid"
    : d.subscriptionLocal ? "Subscribed locally, not stored on server"
    : "No subscription yet";

  const vapidKind: RowKind = d.vapidConfigured ? "ok" : "err";

  let deliveryKind: RowKind = "idle";
  let deliveryLabel = "No delivery on record yet";
  if (d.staleSubscription) {
    deliveryKind = "err";
    deliveryLabel = `Recent sends failed (${d.failureCount}) — re-enable below`;
  } else if (d.lastDeliveryAt) {
    deliveryKind = "ok";
    deliveryLabel = `Last activity ${timeAgo(d.lastDeliveryAt)}`;
  }

  return [
    { kind: permKind, label: permLabel },
    { kind: swKind, label: d.swRegistered ? "Service worker registered" : "Service worker not registered" },
    { kind: subKind, label: subLabel },
    { kind: vapidKind, label: d.vapidConfigured ? "Server VAPID configured" : "Server VAPID not configured" },
    { kind: deliveryKind, label: deliveryLabel, detail: d.lastError ?? undefined },
  ];
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

function RowItem({ row }: { row: Row }) {
  const icon = row.kind === "ok"
    ? <Check className="h-3.5 w-3.5 text-emerald-400" />
    : row.kind === "warn"
    ? <AlertTriangle className="h-3.5 w-3.5 text-warn" />
    : row.kind === "err"
    ? <X className="h-3.5 w-3.5 text-destructive" />
    : <span className="block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />;
  return (
    <li className="flex items-start gap-2 rounded-md bg-background/30 px-2.5 py-1.5 ring-1 ring-border/40">
      <span className="mt-0.5 flex h-4 w-4 items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-foreground/90">{row.label}</div>
        {row.detail && <div className="text-[10.5px] text-muted-foreground truncate">{row.detail}</div>}
      </div>
    </li>
  );
}

function Header({ status, loading, onRefresh }: {
  status: "ready" | "off" | "blocked" | "needs-config";
  loading?: boolean;
  onRefresh?: () => void;
}) {
  const tone =
    status === "ready" ? "bg-primary/15 text-primary ring-primary/30"
    : status === "blocked" ? "bg-destructive/15 text-destructive ring-destructive/30"
    : status === "needs-config" ? "bg-warn/15 text-warn ring-warn/30"
    : "bg-muted/30 text-muted-foreground ring-border/50";
  const label =
    status === "ready" ? "On"
    : status === "blocked" ? "Blocked"
    : status === "needs-config" ? "Setup needed"
    : "Off";
  return (
    <div className="flex items-start gap-3">
      <div className="rounded-md bg-primary/15 p-2 ring-1 ring-primary/30">
        {status === "ready" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4 text-primary" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold">Push notifications</h2>
          <span className={"rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wider ring-1 " + tone}>
            {label}
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              aria-label="Re-check status"
              title="Re-check status"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground">Browser / PWA push for reminders. Respects quiet hours.</p>
      </div>
    </div>
  );
}

function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-background/40 p-3 ring-1 ring-border/60">
      <span className="mt-0.5 text-foreground/70">{icon}</span>
      <div className="text-[12px] text-muted-foreground">{children}</div>
    </div>
  );
}

function isIosNotInstalled(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIos = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && (navigator as any).maxTouchPoints > 1);
  if (!isIos) return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches
    || (navigator as any).standalone === true;
  return !standalone;
}

function IosInstallGuidance() {
  return (
    <div className="mt-3 rounded-lg bg-amber-500/5 p-3 ring-1 ring-amber-500/30 text-[12px]">
      <div className="flex items-center gap-2 font-medium text-amber-300">
        <Info className="h-4 w-4" />
        Install Metro Echo first on iPhone
      </div>
      <p className="mt-1 text-muted-foreground">
        iOS is picky — Safari only allows push notifications after Echo is added to the Home Screen.
      </p>
      <ol className="mt-2 space-y-1 pl-5 text-muted-foreground list-decimal">
        <li>Open Metro Echo in <span className="text-foreground">Safari</span> (not Chrome).</li>
        <li>Tap the <span className="text-foreground">Share</span> button.</li>
        <li>Choose <span className="text-foreground">Add to Home Screen</span>, then <span className="text-foreground">Add</span>.</li>
        <li>Open Metro Echo from the new Home Screen icon.</li>
        <li>Come back here and tap <span className="text-foreground">Enable push reminders</span>.</li>
      </ol>
    </div>
  );
}
