// TodaySectionSheet — the drill-down behind each Today section.
//
// Today stays short on purpose: it shows the top few rows and a "See all" tap.
// This sheet is where the full underlying list lives — every overdue promise,
// every staged action, every dated commitment, every recorded event — with each
// row handing off to the surface that owns its review → approve → execute path.
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/state-views";
import { Badge } from "@/components/ui/badge";
import { BUCKETS, bucketEvents } from "@/lib/changeBuckets";
import { formatDistanceToNow, format, isToday, isTomorrow } from "date-fns";
import { ArrowRight, CornerDownRight, ChevronDown } from "lucide-react";

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

/** The raw record behind a row, folded away until asked for. */
function PeelTab({ raw, count, latest }: { raw: string; count: number; latest: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="ml-auto flex min-h-[32px] items-center gap-1 px-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/70 hover:text-foreground"
      >
        <CornerDownRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
        {open ? "Hide the record" : "Why am I seeing this?"}
      </button>
      {open ? (
        <div className="animate-accordion-down overflow-hidden">
          <dl className="mt-1 space-y-0.5 rounded-sm border border-dashed border-border/60 bg-background/60 px-2.5 py-2 font-mono text-[10.5px] text-muted-foreground">
            <div className="flex gap-2"><dt className="w-16 shrink-0 opacity-70">record</dt><dd className="min-w-0 break-all text-foreground/80">{raw}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 opacity-70">times</dt><dd>{count}×</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 opacity-70">latest</dt><dd>{format(new Date(latest), "d MMM HH:mm:ss")}</dd></div>
            <div className="flex gap-2"><dt className="w-16 shrink-0 opacity-70">source</dt><dd>recorded by Echo · no edits</dd></div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function DrillRow({
  label,
  meta,
  tone,
  onClick,
  trailing,
  provenance,
}: {
  label: string;
  meta?: string;
  tone?: "warn";
  onClick?: () => void;
  /* Rows that can be resolved here carry their own controls; those controls
     always stop for a consequence preview before anything is written. */
  trailing?: React.ReactNode;
  provenance?: { raw: string; count: number; latest: string };
}) {
  const clickable = onClick && !trailing;
  const Tag = clickable && !provenance ? "button" : "div";
  return (
    <div
      className={cn(
        "rounded-lg border border-border/50 bg-surface-elevated px-3 py-2",
        tone === "warn" && "border-warn/40",
      )}
    >
      <Tag
        onClick={clickable ? onClick : undefined}
        className={cn(
          "flex w-full min-h-[40px] items-center gap-2 text-left",
          clickable && "transition-colors hover:text-primary",
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
      {provenance ? <PeelTab {...provenance} /> : null}
    </div>
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
      // Four human shelves; housekeeping folds away at the bottom.
      const { buckets, hidden, hiddenLines } = bucketEvents(events);
      if (buckets.length === 0) {
        return (
          <div className="space-y-3">
            <EmptyState
              title="Only housekeeping so far"
              hint="Background checks ran, nothing you need to read. Notes, reminders and approvals show up here."
            />
            <PlumbingFold hidden={hidden} lines={hiddenLines} onOpenRoll={() => go("receipts")} />
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <p className="text-[12.5px] leading-snug text-foreground/90">{debriefLine(buckets, hidden)}</p>
          {buckets.map((b) => {
            const def = BUCKETS[b.key];
            return (
              <section key={b.key} className="vanta-inset p-2.5">
                <button
                  type="button"
                  onClick={() => go(def.target)}
                  className="mb-2 flex w-full min-h-[44px] items-center gap-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[11px] uppercase tracking-[0.14em] text-foreground">{def.title}</span>
                    <span className="block text-[11px] text-muted-foreground">{def.hint}</span>
                  </span>
                  <Badge variant="outline" className="font-mono">{b.total}</Badge>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
                <div className="space-y-1.5">
                  {b.lines.map((l) => (
                    <DrillRow
                      key={l.label}
                      label={l.count > 1 ? `${l.label} · ${l.count}×` : l.label}
                      meta={formatDistanceToNow(new Date(l.latest), { addSuffix: true })}
                      onClick={() => go(def.target)}
                      provenance={{ raw: l.raw, count: l.count, latest: l.latest }}
                    />
                  ))}
                </div>
              </section>
            );
          })}
          <PlumbingFold hidden={hidden} lines={hiddenLines} onOpenRoll={() => go("receipts")} />
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
