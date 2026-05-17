import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Clock, HelpCircle } from "lucide-react";
import { AWARENESS_SECTIONS, useAwareness } from "@/providers/AwarenessProvider";
import { coerceSignal } from "@/lib/vantaSignal";

const FRESH_MS = 24 * 60 * 60 * 1000;
const AGING_MS = 7 * 24 * 60 * 60 * 1000;

const CRITICAL = new Set(["hazards", "scams", "connectivity"]);

type Row = {
  key: string;
  icon: typeof AlertTriangle;
  tone: string;
  title: string;
  reason: string;
  section?: string;
  isWarning?: boolean;
};

type Props = {
  onOpenSection: (section: string) => void;
  onOpenWarning?: () => void;
  className?: string;
};

/**
 * AttentionQueue — pure derivation over existing provider state.
 * Never fetches. Empty state is calm, not alarmist.
 */
export function AttentionQueue({ onOpenSection, onOpenWarning, className }: Props) {
  const { snapshot, latestBySection, place } = useAwareness();

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const compact = snapshot?.compact as any;
    const warning = compact?.location_warning;
    if (warning) {
      const s = coerceSignal(warning);
      out.push({
        key: "warning",
        icon: AlertTriangle,
        tone: "border-warn/40 bg-warn/5 text-warn",
        title: s.title || "Location warning",
        reason: s.short_summary || "Tap to review.",
        isWarning: true,
      });
    }
    for (const sec of AWARENESS_SECTIONS) {
      const b = latestBySection[sec];
      if (!b) continue;
      const sig = coerceSignal(b.signal ?? {});
      const risky = sig.risk_level !== "none";
      if (b.confidence === "low" && risky) {
        out.push({
          key: `low:${sec}`,
          icon: AlertTriangle,
          tone: "border-warn/30 bg-warn/5 text-warn",
          title: sec,
          reason: "Low confidence on a risky layer.",
          section: sec,
        });
      }
    }
    for (const sec of AWARENESS_SECTIONS) {
      const b = latestBySection[sec];
      if (!b) continue;
      const age = Date.now() - new Date(b.generated_at).getTime();
      if (age >= AGING_MS) {
        out.push({
          key: `stale:${sec}`,
          icon: Clock,
          tone: "border-border/60 bg-surface-elevated/40 text-muted-foreground",
          title: sec,
          reason: "Briefing has gone stale.",
          section: sec,
        });
      }
    }
    if (place) {
      for (const sec of AWARENESS_SECTIONS) {
        if (!CRITICAL.has(sec)) continue;
        if (latestBySection[sec]) continue;
        out.push({
          key: `missing:${sec}`,
          icon: HelpCircle,
          tone: "border-dashed border-border/60 bg-surface-elevated/30 text-muted-foreground",
          title: sec,
          reason: "Critical layer with no briefing yet.",
          section: sec,
        });
      }
    }
    return out.slice(0, 6);
  }, [snapshot, latestBySection, place]);

  if (rows.length === 0) {
    return (
      <p className={cn("text-[12px] italic text-muted-foreground", className)}>
        Nothing pulling at your attention.
      </p>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {rows.map((r) => {
        const Icon = r.icon;
        return (
          <li key={r.key}>
            <button
              type="button"
              onClick={() => {
                if (r.isWarning) onOpenWarning?.();
                else if (r.section) onOpenSection(r.section);
              }}
              className={cn(
                "flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-left text-[12px] transition-colors hover:bg-surface-elevated/60",
                r.tone,
              )}
            >
              <Icon className="mt-[2px] h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium capitalize text-foreground/90">{r.title}</span>
                <span className="block text-[11.5px] text-muted-foreground">{r.reason}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
