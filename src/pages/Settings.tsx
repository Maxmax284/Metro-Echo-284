import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useIsOwner } from "@/hooks/useIsOwner";
import { useSystemControls } from "@/hooks/useSystemControls";
import { ExplainThisButton } from "@/components/ask/ExplainThisButton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldAlert, Power, ChevronRight } from "lucide-react";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { SETTINGS_GROUPS } from "@/lib/settingsGroups";
import { SystemHealthLine } from "@/components/settings/SystemHealthLine";
import { InstallVantaSection } from "@/components/settings/InstallVantaSection";
import { TelegramQuickConnect } from "@/components/settings/TelegramQuickConnect";
import { CalendarQuickConnect } from "@/components/settings/CalendarQuickConnect";
import { setRoom } from "@/lib/skins";

export default function Settings() {
  const { session } = useAuth();
  const isOwner = useIsOwner();
  const { controls, loading, update } = useSystemControls();

  // The control room is its own wall: a maintenance door, not one of the four
  // rooms. Restored on the way out so the backdrop follows navigation again.
  useEffect(() => {
    setRoom("settings");
    return () => setRoom("today");
  }, []);

  if (!session) {
    return <div className="p-8 text-sm text-muted-foreground">Sign in required.</div>;
  }
  if (isOwner === null || loading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading control room…</div>;
  }
  if (!isOwner) {
    return (
      <div className="p-8">
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">Owner-only area. You don't have access.</p>
      </div>
    );
  }
  if (!controls) return null;

  const lockdown = controls.global_usage_mode === "lockdown";

  const emergencyDisable = async () => {
    await update({ external_apis_enabled: false, global_usage_mode: "lockdown" });
    toast.success(vantaSay.lockdown());
  };

  return (
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-6">
      {/* At 384px the kill switch drops to its own row instead of colliding
          with the room name. */}
      <header className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/"
          aria-label="Back to Echo"
          className="vanta-focus inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md ring-1 ring-border/60 hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold tracking-tight">Control Room</h1>
          <p className="truncate text-xs text-muted-foreground">Everything is one tap deep.</p>
        </div>
        <ExplainThisButton room="settings" />

        <Button
          size="sm" variant="destructive"
          className="order-last w-full gap-1 sm:order-none sm:ml-auto sm:w-auto"
          onClick={emergencyDisable}
          disabled={lockdown}
        >
          <Power className="h-3.5 w-3.5" />
          {lockdown ? "Locked down" : "Emergency disable"}
        </Button>

      </header>


      {lockdown && (
        <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 ring-1 ring-destructive/30">
          <ShieldAlert className="mt-0.5 h-4 w-4 text-destructive" />
          <div className="text-xs">
            <div className="font-medium text-destructive">Lockdown active</div>
            <div className="text-muted-foreground">No external API calls will run. Switch mode to resume.</div>
          </div>
        </div>
      )}

      {/* One button at the top of the control room. It vanishes once installed. */}
      <InstallVantaSection />

      {/* One plain read on the connections Echo relies on. */}
      <SystemHealthLine />

      {/* A dead personal Google grant gets its own loud door — the health line
          above only watches platform plumbing. */}
      <GoogleAttentionLine />

      {/* Telegram is the field interface — it gets its own door, not a nested one. */}
      <TelegramQuickConnect />

      {/* The calendar is the other surface people arrive looking for. */}
      <CalendarQuickConnect />

      <ul className="space-y-2">
        {SETTINGS_GROUPS.map((g) => (
          <li key={g.id}>
            <Link
              to={`/settings/g/${g.id}`}
              className="vanta-focus group flex items-center gap-3 rounded-xl surface-elevated p-3.5 ring-1 ring-border/60 transition-colors hover:bg-surface-elevated hover:ring-primary/30"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
                <g.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium">{g.title}</span>
                <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{g.blurb}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

