import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  coerceSignal,
  CONFIDENCE_TONE,
  RISK_TONE,
  ROUTE_LABEL,
  type SignalRoute,
  type VantaSignal,
} from "@/lib/vantaSignal";
import { stripMarkdown } from "@/lib/markdown";
import { AlertTriangle, ChevronDown, ChevronUp, Clock, Radio } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { FeedbackBar } from "@/components/feedback/FeedbackBar";

type Props = {
  /** Anything: a full VantaSignal, a partial, legacy briefing, etc. */
  signal: unknown;
  /** Optional generated_at — shown as freshness if present. */
  generatedAt?: string | null;
  /** Optional: fallback prose (legacy briefing.content) when no long_detail. */
  fallbackBody?: string | null;
  /** Optional handler for action routes. */
  onRoute?: (route: SignalRoute, signal: VantaSignal) => void;
  /** Compact = no long_detail toggle, no routes. */
  compact?: boolean;
  className?: string;
};

const FRESH_TONE: Record<string, string> = {
  live:    "bg-primary/15 text-primary ring-primary/30",
  cached:  "bg-accent/15 text-accent ring-accent/30",
  stale:   "bg-warn/15 text-warn ring-warn/40",
  unknown: "bg-muted/40 text-muted-foreground ring-border/60",
};

const Chip = ({ children, tone, title }: { children: React.ReactNode; tone: string; title?: string }) => (
  <span
    title={title}
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider ring-1",
      tone,
    )}
  >
    {children}
  </span>
);

/**
 * SignalCard — single, consistent renderer for ANY VantaSignal.
 * Every field has a safe default via coerceSignal, so partial/legacy
 * payloads never crash or leak raw markdown.
 */
export function SignalCard({
  signal,
  generatedAt,
  fallbackBody,
  onRoute,
  compact,
  className,
}: Props) {
  const s = coerceSignal(signal);
  const [expanded, setExpanded] = useState(false);

  const longBody = stripMarkdown(s.long_detail || fallbackBody || "");
  const hasLong = !!longBody && longBody !== stripMarkdown(s.short_summary);
  const hasWhy = !!s.why_it_matters?.trim();
  const hasNext = !!s.what_to_do_next?.trim();

  const needsConfirm = s.requires_confirmation;

  return (
    <div
      className={cn(
        "rounded-xl border bg-surface-elevated/40 p-3 ring-1 ring-border/60",
        needsConfirm && "ring-warn/40 bg-warn/5",
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Radio className="h-3 w-3 shrink-0 text-primary/80" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {s.signal_type.replace(/_/g, " ")}
            </span>
          </div>
          <h4 className="mt-0.5 text-sm font-medium leading-snug text-foreground">
            {stripMarkdown(s.title) || "Signal"}
          </h4>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
          <Chip tone={CONFIDENCE_TONE[s.confidence]} title="Confidence">
            {s.confidence}
          </Chip>
          {s.risk_level !== "none" && (
            <Chip tone={RISK_TONE[s.risk_level]} title="Risk level">
              {s.risk_level} risk
            </Chip>
          )}
          <Chip tone={FRESH_TONE[s.freshness] ?? FRESH_TONE.unknown} title="Freshness">
            <Clock className="h-2.5 w-2.5" /> {s.freshness}
          </Chip>
        </div>
      </div>

      {/* Short summary */}
      {s.short_summary && (
        <p className="mt-2 text-[13px] leading-relaxed text-foreground/90">
          {stripMarkdown(s.short_summary)}
        </p>
      )}

      {/* Why / next */}
      {(hasWhy || hasNext) && (
        <dl className="mt-2 space-y-1.5 text-[12px] leading-relaxed">
          {hasWhy && (
            <div>
              <dt className="text-[9.5px] uppercase tracking-wider text-muted-foreground">Why it matters</dt>
              <dd className="text-foreground/85">{stripMarkdown(s.why_it_matters)}</dd>
            </div>
          )}
          {hasNext && (
            <div>
              <dt className="text-[9.5px] uppercase tracking-wider text-muted-foreground">What to do next</dt>
              <dd className="text-foreground/85">{stripMarkdown(s.what_to_do_next)}</dd>
            </div>
          )}
        </dl>
      )}

      {/* Confirmation prompt */}
      {needsConfirm && (
        <div className="mt-2 flex items-start gap-1.5 rounded-md bg-warn/10 p-2 text-[11.5px] text-warn ring-1 ring-warn/30">
          <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
          <span>{stripMarkdown(s.confirmation_reason) || "Confirm before acting on this."}</span>
        </div>
      )}

      {/* Footer: sources + freshness time */}
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
        {s.source_labels.length > 0 ? (
          s.source_labels.map((src) => (
            <span
              key={src}
              className="rounded bg-muted/40 px-1.5 py-0.5 ring-1 ring-border/60"
            >
              {src}
            </span>
          ))
        ) : (
          <span className="italic">no sources tagged</span>
        )}
        {generatedAt && (
          <span className="ml-auto">
            {formatDistanceToNow(new Date(generatedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {/* Long detail toggle */}
      {!compact && hasLong && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Hide full detail" : "View full detail"}
          </button>
          {expanded && (
            <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-foreground/80">
              {longBody}
            </p>
          )}
        </div>
      )}

      {/* Routes / operational verbs */}
      {!compact && s.available_routes.length > 0 && onRoute && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {s.available_routes.map((r) => (
            <Button
              key={r}
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => onRoute(r, s)}
            >
              {ROUTE_LABEL[r] ?? r}
            </Button>
          ))}
        </div>
      )}

      {/* Stage 2 — always-on feedback row */}
      {!compact && (
        <div className="mt-2 border-t border-border/50 pt-2">
          <FeedbackBar
            surface="awareness"
            targetType={`signal:${s.signal_type}`}
            targetId={s.title || s.signal_type}
            label={s.title}
            original={s}
          />
        </div>
      )}
    </div>
  );
}
