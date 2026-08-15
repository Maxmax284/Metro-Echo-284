// NoticedRow — the one place proactive awareness speaks.
//
// One signal at a time, always a draft. Tapping hands off to the surface that
// owns the review → approve → execute → receipt path. Dismiss is one tap and
// sticks. When there is nothing, this renders nothing at all.
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { MOTION_PRESS } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import type { NoticedSignal } from "@/hooks/useTodayDigest";

const DESTINATION: Record<string, SurfaceKey> = {
  project: "projects",
  commitment: "commitments",
  action: "actions",
  document: "briefs",
};

export function NoticedRow({
  signal,
  onNavigate,
  onDismiss,
  onFollow,
}: {
  signal: NoticedSignal | null;
  onNavigate: (k: SurfaceKey) => void;
  onDismiss: (id: string) => void;
  onFollow: (signal: NoticedSignal) => void;
}) {
  if (!signal) return null;
  const target = DESTINATION[signal.related_entity_type ?? ""] ?? "work";

  return (
    <div className="vanta-inset motion-arrival flex items-start gap-2.5 px-3 py-2.5">
      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <MachineLabel className="text-accent/80">Vanta noticed</MachineLabel>
        <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">{signal.title}</p>
        {signal.body && (
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{signal.body}</p>
        )}
        <Button
          variant="ghost"
          size="sm"
          className={cn("mt-1.5 h-8 px-2 text-[11.5px] text-accent", MOTION_PRESS)}
          onClick={() => {
            onFollow(signal);
            onNavigate(target);
          }}
        >
          Take a look
        </Button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-11 w-11 shrink-0 text-muted-foreground", MOTION_PRESS)}
        aria-label="Dismiss"
        onClick={() => onDismiss(signal.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
