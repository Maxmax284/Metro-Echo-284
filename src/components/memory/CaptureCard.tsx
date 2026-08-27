import { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, FileText, MapPin, Bot, Inbox, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot, type DotTone } from "@/components/ui/status-dot";
import { CardMeta } from "@/components/ui/card-meta";
import { ProvenanceChip } from "@/components/ui/provenance";
import { WhyThis } from "@/components/ui/why-this";
import { cn } from "@/lib/utils";

export type CaptureSource = "telegram" | "companion" | "file" | "field_note" | "note" | "unknown";

export type CaptureItem = {
  id: string;
  source: CaptureSource;
  text: string;
  detectedType?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  status?: string | null;
  routedTo?: string | null;
  needsReview?: boolean;
  sensitive?: boolean;
  ts: string;
  linked?: string[];
  why?: string | null;
};

export type CaptureAction = {
  label: string;
  onClick: () => void | Promise<void>;
  primary?: boolean;
};

const sourceMeta: Record<CaptureSource, { label: string; Icon: typeof Inbox }> = {
  telegram: { label: "Telegram", Icon: MessageSquare },
  companion: { label: "Companion", Icon: Bot },
  file: { label: "File", Icon: FileText },
  field_note: { label: "Field note", Icon: MapPin },
  note: { label: "Note", Icon: FileText },
  unknown: { label: "Capture", Icon: Inbox },
};

const confTone: Record<NonNullable<CaptureItem["confidence"]>, DotTone> = {
  high: "primary",
  medium: "accent",
  low: "destructive",
};

export function CaptureCard({ item, actions, footer }: { item: CaptureItem; actions?: CaptureAction[]; footer?: ReactNode }) {
  const meta = sourceMeta[item.source] ?? sourceMeta.unknown;
  const Icon = meta.Icon;
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-surface-elevated/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-foreground/95 line-clamp-2">{item.text || <span className="italic text-muted-foreground">No text</span>}</p>
          {/* One meta line: what it is, what state it is in, where it opens.
              The source is the single provenance marker beside it. */}
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <CardMeta
              object="capture"
              state={item.routedTo ? `filed in ${item.routedTo}` : item.needsReview ? "needs review" : "not sorted yet"}
              destination={item.routedTo ?? "Inbox"}
              className="min-w-0"
            />
            <ProvenanceChip source={item.source} className="hidden sm:inline-flex" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            {item.detectedType && (
              <span className="rounded-full bg-muted/30 px-2 py-0.5 ring-1 ring-border/50">
                {item.detectedType}
              </span>
            )}
            {item.confidence && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
                <StatusDot tone={confTone[item.confidence]} pulse={item.confidence === "low"} />
                {item.confidence} confidence
              </span>
            )}
            {item.routedTo && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary ring-1 ring-primary/30">
                → {item.routedTo}
              </span>
            )}
            {item.needsReview && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn/10 px-2 py-0.5 text-warn ring-1 ring-warn/30">
                <AlertCircle className="h-3 w-3" /> Needs review
              </span>
            )}
            {item.sensitive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/30 px-2 py-0.5 text-foreground/80 ring-1 ring-border/60" title="May contain personal or financial information">
                <AlertCircle className="h-3 w-3" /> Sensitive
              </span>
            )}
            <span>· {formatDistanceToNow(new Date(item.ts), { addSuffix: true })}</span>
          </div>
          {/* The reason Vanta already recorded, on demand. Never invented. */}
          <WhyThis reason={item.why} className="mt-1" />
          {item.sensitive && (
            <p className="mt-1 text-[10.5px] text-foreground/70">
              This may contain personal or financial information. Review before routing.
            </p>
          )}
          {item.linked && item.linked.length > 0 && (
            <div className="mt-1 text-[10.5px] text-muted-foreground/80">Linked: {item.linked.join(" · ")}</div>
          )}
        </div>
      </div>
      {actions && actions.length > 0 && (
        <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-0.5 sm:flex-wrap sm:overflow-visible">
          {actions.map((a, i) => (
            <Button
              key={i}
              size="sm"
              variant={a.primary ? "default" : "outline"}
              className={cn("h-7 shrink-0 snap-start whitespace-nowrap px-2 text-[11px]")}
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
      {footer}
    </div>
  );
}
