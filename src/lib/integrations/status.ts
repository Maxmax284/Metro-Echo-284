import type { SystemControls } from "@/hooks/useSystemControls";
import type { IntegrationDef, IntegrationStatus } from "./registry";

export type RuntimeSignals = {
  telegramLinked?: boolean;
  emailLinked?: boolean;
};

export function computeStatus(
  def: IntegrationDef,
  controls: SystemControls | null,
  signals: RuntimeSignals,
): IntegrationStatus {
  if (def.key === "vanta_core") return "live";
  if (def.bucket === "deferred") return "deferred";

  // Honor the kill switch if there is one.
  if (def.killSwitchKey && controls && controls[def.killSwitchKey] === false) {
    return def.bucket === "planned" ? "planned" : "disabled";
  }

  switch (def.key) {
    case "telegram":
      return signals.telegramLinked ? "live" : "needs_setup";
    case "email":
      return signals.emailLinked ? "live" : "needs_setup";
    case "gth":
      return controls?.gth_enabled ? "partial" : "planned";
    case "campcore":
      return controls?.campcore_enabled ? "configured" : "planned";
    case "calendar":
      return controls?.calendar_sync_enabled ? "configured" : "planned";
    case "fenrir":
      return controls?.fenrir_enabled ? "configured" : "planned";
    default:
      return "planned";
  }
}

export const STATUS_LABEL: Record<IntegrationStatus, string> = {
  live: "Live",
  partial: "Partially live",
  configured: "Configured",
  needs_setup: "Needs setup",
  planned: "Planned",
  deferred: "Deferred",
  disabled: "Disabled",
  blocked: "Blocked",
};

export const STATUS_TONE: Record<IntegrationStatus, string> = {
  live: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30",
  partial: "bg-primary/15 text-primary ring-primary/30",
  configured: "bg-primary/15 text-primary ring-primary/30",
  needs_setup: "bg-amber-500/15 text-amber-300 ring-amber-500/30",
  planned: "bg-muted/40 text-muted-foreground ring-border/60",
  deferred: "bg-muted/40 text-muted-foreground ring-border/60",
  disabled: "bg-muted/40 text-muted-foreground ring-border/60",
  blocked: "bg-destructive/15 text-destructive ring-destructive/30",
};

export const DIRECTION_LABEL: Record<string, string> = {
  inbound: "Inbound only",
  outbound: "Outbound only",
  inbound_approved_outbound: "Inbound + approved outbound",
  read_only: "Read-only",
  capture_only: "Capture only",
  deferred: "Deferred",
};
