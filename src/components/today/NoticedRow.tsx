// NoticedRow — the one place proactive awareness speaks.
//
// One signal at a time, always a draft. Tapping hands off to the surface that
// owns the review → approve → execute → receipt path. Dismiss is one tap and
// sticks. When there is nothing, this renders nothing at all.
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MachineLabel } from "@/components/ui/instrument";
import { WhySurfaced } from "@/components/ui/why-surfaced";
import { whyFor } from "@/lib/whySurfaced";
import { freshenDayWords } from "@/lib/dayWords";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { MOTION_PRESS } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import type { NoticedSignal } from "@/hooks/useTodayDigest";
import { HeadsUpReply } from "@/components/ask/HeadsUpReply";

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
  const { timezone } = useUserTimezone();
  if (!signal) return null;
  const target = DESTINATION[signal.related_entity_type ?? ""] ?? "work";
  /* Written last night, read this morning: "tomorrow" must re-read as "today". */
  const title = freshenDayWords({ text: signal.title, createdAt: signal.created_at, timezone });
  const body = signal.body ? freshenDayWords({ text: signal.body, createdAt: signal.created_at, timezone }) : null;
  /* The same seven answers as everywhere else, from what the nudge recorded. */
  const why = whyFor({
    source: "What Echo noticed",
    whatChanged: title,
    reason: body ?? "Echo raised this from your own records.",
    whyItMatters: "It is a draft observation, not an instruction.",
    ifIgnored: "Hiding it takes it off Today. Nothing runs from it.",
  });

  return (
    <div id={`situation-${signal.id}`} className="vanta-inset motion-arrival flex items-start gap-2.5 px-3 py-2.5">
      <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
      <div className="min-w-0 flex-1">
        <MachineLabel className="text-accent/80">Echo noticed</MachineLabel>
        <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">{title}</p>
        {/* One shared reveal, rendering only what was recorded. */}
        <WhySurfaced why={why} className="mt-1" />
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 px-2 text-[11.5px] text-accent", MOTION_PRESS)}
            onClick={() => {
              onFollow(signal);
              onNavigate(target);
            }}
          >
            Take a look
          </Button>
          {/* Answer it here. The reply becomes a real turn Echo acts on. */}
          <HeadsUpReply nudgeId={signal.id} label={title} onReplied={() => onFollow(signal)} />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className={cn("h-11 w-11 shrink-0 text-muted-foreground", MOTION_PRESS)}
        aria-label="Hide"
        onClick={() => onDismiss(signal.id)}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
