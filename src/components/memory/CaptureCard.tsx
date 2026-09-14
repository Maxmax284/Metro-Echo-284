import { ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageSquare, FileText, MapPin, Bot, Inbox, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusDot, type DotTone } from "@/components/ui/status-dot";
import { CardMeta } from "@/components/ui/card-meta";
import { ProvenanceChip } from "@/components/ui/provenance";
import { bridgeReviewLabel } from "@/lib/vantaNouns";
import { WhyThis } from "@/components/ui/why-this";
import { cn } from "@/lib/utils";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { CardMoreMenu } from "@/components/ui/CardMoreMenu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

import {
  dispositionChipClass, dispositionLabel, type OperationalEvent,
} from "@/lib/campEvents";

export type CaptureSource = "telegram" | "companion" | "file" | "field_note" | "note" | "unknown";

export type CaptureItem = {
  id: string;
  source: CaptureSource;
  /**
   * The platform token when this arrived over a bridge (Ground Truth Hub,
   * CampCore, Fenrir). Bridges bring drafts, never authority, so the card says
   * where it came from and that it still needs a human read.
   */
  bridgeSource?: string | null;
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
  /**
   * Hydrated bridge event. When present the card leads with the operational
   * summary (who, which booking, what moved) instead of the raw title string.
   */
  event?: OperationalEvent | null;
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

export function CaptureCard({
  item,
  actions,
  footer,
  /** Pass a specific destination line, or `false` where the parent already says it. */
  aftermath,
}: {
  item: CaptureItem;
  actions?: CaptureAction[];
  footer?: ReactNode;
  aftermath?: string | false;
}) {
  const meta = sourceMeta[item.source] ?? sourceMeta.unknown;
  const ev = item.event ?? null;
  const Icon = meta.Icon;
  const bridgeLine = bridgeReviewLabel(item.bridgeSource);
  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-surface-elevated/40 p-3 text-sm">
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {ev ? (
            <>
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 flex-1 font-medium leading-snug text-foreground line-clamp-2">{ev.headline}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] ring-1",
                    dispositionChipClass(ev.disposition),
                  )}
                >
                  {dispositionLabel(ev.disposition)}
                </span>
              </div>
              <p className="mt-1 text-[12px] leading-snug text-foreground/80">{ev.summary}</p>
              {ev.facts.length > 0 && (
                <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10.5px] leading-snug">
                  {ev.facts.slice(0, 6).map((f) => (
                    <div key={f.label} className="min-w-0 truncate">
                      <dt className="inline text-muted-foreground">{f.label}: </dt>
                      <dd className="inline text-foreground/90">{f.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {ev.missing.length > 0 && (
                <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground">
                  {ev.platformLabel} did not send: {ev.missing.join(", ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-foreground/95 line-clamp-2">{item.text || <span className="italic text-muted-foreground">No text</span>}</p>
          )}
          {/* One meta line: what it is, what state it is in, where it opens.
              The source is the single provenance marker beside it. */}
          <div className={cn("mt-1 flex min-w-0 items-center gap-1.5", ev && "hidden")}>
            <CardMeta
              object="capture"
              state={item.routedTo ? `filed in ${item.routedTo}` : item.needsReview ? "needs review" : "not sorted yet"}
              destination={item.routedTo ?? "Inbox"}
              className="min-w-0"
            />
            <ProvenanceChip source={item.bridgeSource ?? item.source} className="hidden sm:inline-flex" />
          </div>
          {/* A bridge brings drafts, not authority. Say so on the card. */}
          {bridgeLine && (
            <p className="mt-1 text-[10.5px] leading-snug text-warn">{bridgeLine}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
            {item.detectedType && !ev && (
              <span className="rounded-full bg-muted/30 px-2 py-0.5 ring-1 ring-border/50">
                {item.detectedType}
              </span>
            )}
            {item.confidence && !ev && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
                <StatusDot tone={confTone[item.confidence]} pulse={item.confidence === "low"} />
                {item.confidence} confidence
              </span>
            )}
            {item.needsReview && !ev && (
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
          {/* The reason Echo already recorded, on demand. Never invented. */}
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
      {actions && actions.length > 0 && (() => {
        /* Doctrine: a card offers a decision, not a menu. Up to three moves on
           the face (the primary one first), everything else behind "•••" — nine
           buttons scrolling off the edge of a phone is not a choice. */
        const ordered = [...actions].sort((a, b) => Number(!!b.primary) - Number(!!a.primary));
        const face = ordered.slice(0, 3);
        const rest = ordered.slice(3);
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {face.map((a, i) => (
              <Button
                key={i}
                size="sm"
                variant={a.primary ? "default" : "outline"}
                className="h-7 shrink-0 whitespace-nowrap px-2 text-[11px]"
                onClick={a.onClick}
              >
                {a.label}
              </Button>
            ))}
            {rest.length > 0 && (
              <CardMoreMenu label="More moves">
                {rest.map((a, i) => (
                  <DropdownMenuItem key={i} onClick={() => void a.onClick()} className="text-[12px]">
                    {a.label}
                  </DropdownMenuItem>
                ))}
              </CardMoreMenu>
            )}
          </div>
        );
      })()}

      {footer}
      {aftermath === false ? null : (
        <AftermathHint
          text={
            typeof aftermath === "string"
              ? aftermath
              : item.routedTo
                ? `Already filed to ${item.routedTo} · the route is recorded in Receipts`
                : "Still a draft · routing it makes it a note, a promise or an action"
          }
        />
      )}
    </div>
  );
}
