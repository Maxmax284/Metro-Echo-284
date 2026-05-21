// SherlockSettingsPanel — owner controls for the ambient recognition layer.
// Lives at the top of the Sherlock surface as a collapsible card. Toggles
// here gate which findings get drafted, which surfaces show them, and the
// cooldown on dismissed suggestions. Nothing here triggers a scan.
import { useState } from "react";
import { ChevronDown, ChevronUp, Settings2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSherlockSettings } from "@/hooks/useSherlockSettings";
import { cn } from "@/lib/utils";

type Row = {
  key:
    | "ambient_enabled"
    | "show_low_confidence"
    | "sensitive_caution"
    | "manual_only_for_sensitive"
    | "show_in_canvas"
    | "show_in_briefings";
  label: string;
  hint: string;
};

const ROWS: Row[] = [
  { key: "ambient_enabled",         label: "Ambient recognition",       hint: "Let Sherlock draft findings as new captures land." },
  { key: "show_low_confidence",     label: "Show low-confidence",       hint: "Surface guesses Sherlock isn't sure about." },
  { key: "sensitive_caution",       label: "Sensitive caution",         hint: "Hide previews on sensitive items until you reveal." },
  { key: "manual_only_for_sensitive", label: "Manual routing on sensitive", hint: "Sensitive findings always need explicit approval." },
  { key: "show_in_canvas",          label: "Surface in Canvas",         hint: "Show suggested relations as dashed edges." },
  { key: "show_in_briefings",       label: "Surface in briefings",      hint: "Include pattern findings in the daily briefing." },
];

const COOLDOWN_PRESETS = [1, 3, 7, 14, 30];

export function SherlockSettingsPanel() {
  const { settings, loading, update } = useSherlockSettings();
  const [open, setOpen] = useState(false);

  if (loading || !settings) {
    return (
      <Card className="p-3 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading Sherlock settings…
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex items-center gap-2 text-[12px] font-medium">
          <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
          Sherlock controls
          <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
            {settings.ambient_enabled ? "ambient on" : "ambient off"}
          </span>
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>

      {open && (
        <div className="space-y-2 border-t border-border/60 px-3 py-3">
          {ROWS.map((r) => (
            <label key={r.key} className="flex items-start justify-between gap-3 py-1">
              <div className="min-w-0">
                <p className="text-[12px] font-medium leading-tight">{r.label}</p>
                <p className="text-[10.5px] text-muted-foreground leading-snug">{r.hint}</p>
              </div>
              <Switch
                checked={Boolean(settings[r.key])}
                onCheckedChange={(v) => update({ [r.key]: v } as any)}
              />
            </label>
          ))}

          <div className="pt-2 border-t border-border/60">
            <p className="text-[12px] font-medium">Dismissed cooldown</p>
            <p className="text-[10.5px] text-muted-foreground leading-snug">
              How long a dismissed suggestion stays out of view before it can resurface.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {COOLDOWN_PRESETS.map((days) => (
                <Button
                  key={days}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update({ dismissed_cooldown_days: days })}
                  className={cn(
                    "h-7 rounded-full px-2.5 text-[11px] ring-1",
                    settings.dismissed_cooldown_days === days
                      ? "bg-primary/15 text-primary ring-primary/40 hover:bg-primary/20"
                      : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
                  )}
                >
                  {days}d
                </Button>
              ))}
            </div>
          </div>

          <p className="pt-2 text-[10px] text-muted-foreground">
            Nothing here triggers a scan. Findings stay drafts until you approve them.
          </p>
        </div>
      )}
    </Card>
  );
}
