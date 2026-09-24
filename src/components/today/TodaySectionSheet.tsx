// TodaySectionSheet — the drill-down behind each Today section.
//
// Today stays short on purpose: it shows the top few rows and a "See all" tap.
// This sheet is where the full underlying list lives — every overdue promise,
// every staged action, every dated commitment, every recorded event — with each
// row handing off to the surface that owns its review → approve → execute path.
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/state-views";
import { Badge } from "@/components/ui/badge";
import { humanizeEvent } from "@/lib/plainLabels";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOTION_SHEET } from "@/lib/motion";
import { useFlipEntry } from "@/hooks/useFlipEntry";

import type { SurfaceKey } from "@/components/shell/SurfaceTabs";
import type { AttentionItem, DigestCommitment, DigestEvent } from "@/lib/todayDigest";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { CommitmentActions } from "@/components/commitments/CommitmentActions";

export type TodaySectionKey = "now" | "today" | "changed" | "next";

const TITLES: Record<TodaySectionKey, { title: string; hint: string }> = {
  now: {
    title: "Needs attention",
    hint: "Everything waiting on you in this space. Nothing runs until you approve it.",
  },
  today: {
    title: "Due today",
    hint: "Promises with a date of today, soonest first.",
  },
  changed: {
    title: "What changed",
    hint: "Everything Echo recorded recently, newest first.",
  },
  next: {
    title: "What's next",
    hint: "Dated promises ahead of you, soonest first.",
  },
};

function whenLabel(due: string | null) {
  if (!due) return "no date";
  const d = new Date(due);
  if (isToday(d)) return `today ${format(d, "HH:mm")}`;
  if (isTomorrow(d)) return `tomorrow ${format(d, "HH:mm")}`;
  return format(d, "d MMM HH:mm");
}

function DrillRow({
  label,
  meta,
  tone,
  onClick,
  trailing,
}: {
  label: string;
  meta?: string;
  tone?: "warn";
  onClick?: () => void;
  /* Rows that can be resolved here carry their own controls; those controls
     always stop for a consequence preview before anything is written. */
  trailing?: React.ReactNode;
}) {
  const clickable = onClick && !trailing;
  const Tag = clickable ? "button" : "div";
  return (
    <Tag
      onClick={clickable ? onClick : undefined}
      className={cn(
        "flex w-full min-h-[44px] items-center gap-2 rounded-lg border border-border/50 bg-surface-elevated px-3 py-2 text-left",
        clickable && "transition-colors hover:border-primary/40",
        tone === "warn" && "border-warn/40",
      )}
    >
      {trailing && onClick ? (
        <button onClick={onClick} className="min-w-0 flex-1 text-left text-xs leading-snug text-foreground/90">
          {label}
        </button>
      ) : (
        <span className="min-w-0 flex-1 text-xs leading-snug text-foreground/90">{label}</span>
      )}
      {meta ? <span className="shrink-0 text-[11px] text-muted-foreground">{meta}</span> : null}
      {trailing ?? (onClick ? <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null)}
    </Tag>
  );
}

export function TodaySectionSheet({
  section,
  onClose,
  onNavigate,
  attention,
  dueToday,
  upcoming,
  events,
  onChanged,
}: {
  section: TodaySectionKey | null;
  onClose: () => void;
  onNavigate: (k: SurfaceKey) => void;
  attention: AttentionItem[];
  dueToday: DigestCommitment[];
  upcoming: DigestCommitment[];
  events: DigestEvent[];
  onChanged?: () => void;
}) {
  const meta = section ? TITLES[section] : null;

  const go = (k: SurfaceKey) => {
    onClose();
    onNavigate(k);
  };

  const body = () => {
    if (section === "now") {
      if (attention.length === 0) {
        return (
          <EmptyState
            title="Nothing waiting"
            hint="Overdue promises and actions staged for approval show up here."
          />
        );
      }
      return (
        <div className="space-y-1.5">
          {attention.map((it) => (
            <DrillRow
              key={it.key}
              label={it.label}
              meta={it.meta}
              tone={it.level === "critical" ? "warn" : undefined}
              onClick={() => go(it.destination)}
            />
          ))}
        </div>
      );
    }

    if (section === "today" || section === "next") {
      const list = section === "today" ? dueToday : [...dueToday, ...upcoming];
      if (list.length === 0) {
        return (
          <EmptyState
            title={section === "today" ? "Nothing promised for today" : "No dated promises"}
            hint="When you tell Echo you'll do something by a date, it lands here."
          />
        );
      }
      return (
        <div className="space-y-1.5">
          {list.map((c) => (
            <DrillRow
              key={c.id}
              label={c.summary}
              meta={whenLabel(c.due_at)}
              tone={c.due_at && new Date(c.due_at) < new Date() ? "warn" : undefined}
              trailing={
                <CommitmentActions
                  size="sm"
                  c={{ id: c.id, title: c.summary, due_at: c.due_at, remind_at: null }}
                  onChanged={onChanged}
                />
              }
              onClick={() => go("commitments")}
            />
          ))}
        </div>
      );
    }

    if (section === "changed") {
      if (events.length === 0) {
        return (
          <EmptyState
            title="Nothing recorded yet"
            hint="Every save, approval and run leaves a receipt here."
          />
        );
      }
      // One line per kind of thing, not one row per receipt.
      const grouped = new Map<string, { label: string; count: number; latest: string }>();
      for (const e of events) {
        const label = humanizeEvent(e.event);
        const g = grouped.get(label);
        if (g) g.count += 1;
        else grouped.set(label, { label, count: 1, latest: e.created_at });
      }
      return (
        <div className="space-y-1.5">
          {[...grouped.values()].sort((a, b) => b.count - a.count).map((g) => (
            <DrillRow
              key={g.label}
              label={g.count > 1 ? `${g.label} · ${g.count}×` : g.label}
              meta={`latest ${formatDistanceToNow(new Date(g.latest), { addSuffix: true })}`}
              onClick={() => go("receipts")}
            />
          ))}
        </div>
      );
    }

    return null;
  };

  const count =
    section === "now"
      ? attention.length
      : section === "today"
        ? dueToday.length
        : section === "next"
          ? dueToday.length + upcoming.length
          : events.length;

  const flipRef = useFlipEntry<HTMLDivElement>(!!section);

  return (
    <Sheet open={!!section} onOpenChange={(o) => !o && onClose()}>
      <SheetContent ref={flipRef} side="bottom" className="max-h-[85vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2 text-base">
            {meta?.title}
            {section ? (
              <Badge variant="outline" className="text-[10px]">
                {count}
              </Badge>
            ) : null}
          </SheetTitle>
          <SheetDescription className="text-xs">{meta?.hint}</SheetDescription>
        </SheetHeader>
        {/* Content lands a beat after the panel, so the sheet reads as the
            tapped row expanding rather than a modal dropping in on top. */}
        <div className={cn("mt-3", MOTION_SHEET)}>{body()}</div>
        <AftermathHint
          className="pb-6"
          text="Closing or moving a promise here shows you what changes first · nothing is written until you confirm"
        />

      </SheetContent>
    </Sheet>
  );
}
