// Object-intent card — "Looks like a receipt." plus the offers. One component
// for Ask, the inbox and (as buttons) Telegram, so a thing is introduced the
// same way no matter which door it came in through. Presentation only: the
// caller decides what each offer does. Nothing here executes.
import { FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { objectIntentFor, type ObjectIntent } from "@/lib/objectIntent";

export type ObjectOffer = {
  key: string;
  label: string;
  running?: boolean;
  disabled?: boolean;
};

export function ObjectIntentCard({
  filename,
  detectedDocType,
  confidence,
  mime,
  offers,
  onOffer,
  sensitive,
  className,
}: {
  filename: string;
  detectedDocType?: string | null;
  confidence?: string | null;
  mime?: string | null;
  offers: ObjectOffer[];
  onOffer: (key: string) => void;
  sensitive?: boolean;
  className?: string;
}) {
  const intent: ObjectIntent = objectIntentFor({ filename, detectedDocType, confidence, mime });

  return (
    <div
      className={cn("rounded-xl border border-border/60 bg-muted/10 p-3 ring-1 ring-border/40", className)}
      aria-label="What this looks like"
    >
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium leading-snug">{intent.line}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={filename}>
            {filename}
            {sensitive ? " · marked sensitive — nothing moves without a second confirm" : ""}
          </p>
        </div>
      </div>
      {offers.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {offers.map((o) => (
            <button
              key={o.key}
              type="button"
              disabled={o.disabled || o.running}
              onClick={() => onOffer(o.key)}
              className="inline-flex h-7 items-center gap-1 rounded-full bg-muted/30 px-2.5 text-[11px] font-medium ring-1 ring-border/50 hover:bg-muted/50 disabled:opacity-50"
            >
              {o.running ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
