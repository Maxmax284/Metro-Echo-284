// AttachmentStrip — one compact horizontal row of what's attached.
//
// Attachments never become a vertical wall. Each chip says what the thing is,
// what state it's in, and whether Vanta can actually read it. Honesty over
// affordance: a video says it will be kept, not read.
import { FileText, Image as ImageIcon, Mic, Film, Paperclip, X, RotateCcw, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { inputKindForFile, readabilityFor, sizeLabel, type AskInputKind } from "@/lib/askCapabilities";
import type { StagedFile } from "@/hooks/useStagedUpload";

const ICON: Record<AskInputKind, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  document: FileText,
  audio: Mic,
  video: Film,
  other: Paperclip,
};

const STATE_COPY: Record<StagedFile["status"], string> = {
  staged: "ready",
  queued: "queued",
  uploading: "uploading",
  reading: "reading",
  saved: "read",
  failed: "failed",
};

export function AttachmentStrip({
  items,
  onRemove,
  onRetry,
  className,
}: {
  items: StagedFile[];
  onRemove?: (key: string) => void;
  onRetry?: (key: string) => void;
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <ul
      className={cn("scrollbar-thin flex items-stretch gap-1.5 overflow-x-auto pb-0.5", className)}
      aria-label="Attachments"
    >
      {items.map((s) => {
        const kind = inputKindForFile({ name: s.file.name, type: s.file.type });
        const Icon = ICON[kind];
        const read = readabilityFor(kind);
        const busy = s.status === "uploading" || s.status === "reading" || s.status === "queued";
        const size = sizeLabel(s.file.size);
        return (
          <li
            key={s.key}
            className={cn(
              "flex min-w-[132px] max-w-[200px] shrink-0 items-center gap-2 rounded-[3px] bg-surface-elevated/70 px-2 py-1.5 ring-1",
              s.status === "failed" ? "ring-destructive/40" : "ring-border/60",
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <Icon className={cn("h-3.5 w-3.5 shrink-0", read.readable ? "text-primary" : "text-muted-foreground")} />
            )}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] text-foreground/90">{s.file.name}</div>
              <div className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                {s.errorLabel
                  ? s.errorLabel
                  : read.readable
                    ? [STATE_COPY[s.status], size].filter(Boolean).join(" · ")
                    : read.note}
              </div>
            </div>
            {s.status === "failed" && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(s.key)}
                aria-label={`Retry ${s.file.name}`}
                className="shrink-0 rounded-[2px] p-0.5 text-muted-foreground hover:text-foreground"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(s.key)}
                aria-label={`Remove ${s.file.name}`}
                className="shrink-0 rounded-[2px] p-0.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
