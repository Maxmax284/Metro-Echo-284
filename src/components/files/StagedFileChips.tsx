// Staged file chip row — used in FileUploadCard, ConversationSurface,
// and the Command Files tile. One mental model everywhere.
import { FileText, Image as ImageIcon, FileAudio, FileVideo, X, RotateCw, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StagedFile, StagedStatus } from "@/hooks/useStagedUpload";

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function iconFor(mime: string) {
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("video/")) return FileVideo;
  return FileText;
}

const STATUS_COPY: Record<StagedStatus, string> = {
  staged: "Queued",
  queued: "Queued",
  uploading: "Uploading…",
  reading: "Reading it…",
  saved: "Saved",
  failed: "Failed",
};

export function StagedFileChips({
  items,
  onRemove,
  onRetry,
  onNote,
  showNoteInput = false,
  compact = false,
}: {
  items: StagedFile[];
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  onNote?: (key: string, note: string) => void;
  showNoteInput?: boolean;
  compact?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul
      className={cn(
        "flex flex-col gap-1.5",
        compact ? "text-[11px]" : "text-[12px]",
      )}
      aria-label="Staged files"
    >
      {items.map((s) => {
        const Icon = iconFor(s.file.type || "");
        const isBusy = s.status === "uploading" || s.status === "reading";
        const isSaved = s.status === "saved";
        const isFailed = s.status === "failed";
        return (
          <li
            key={s.key}
            className={cn(
              "group flex w-full flex-col gap-1 rounded-xl border px-2.5 py-1.5 ring-1",
              isFailed
                ? "border-destructive/30 bg-destructive/5 ring-destructive/20"
                : isSaved
                  ? "border-primary/30 bg-primary/5 ring-primary/20"
                  : "border-border/60 bg-surface-elevated/60 ring-border/40",
            )}
          >
            <div className="flex w-full items-center gap-2">
              {isBusy ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              ) : isSaved ? (
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <span
                className="min-w-0 flex-1 truncate font-medium text-foreground/90"
                title={s.file.name}
              >
                {s.file.name}
              </span>
              {!isSaved && !isBusy && (
                <button
                  type="button"
                  onClick={() => onRemove(s.key)}
                  className="-mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  aria-label={`Remove ${s.file.name}`}
                  title="Remove"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 pl-[22px] text-[10.5px] text-muted-foreground">
              <span>{fmtSize(s.file.size)}</span>
              <span aria-hidden>·</span>
              <span
                className={cn(
                  isFailed ? "text-destructive" : isSaved ? "text-primary" : "text-muted-foreground",
                )}
              >
                {STATUS_COPY[s.status]}
              </span>
              {isFailed && onRetry && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-1 h-6 gap-1 px-1.5 text-[10.5px]"
                  onClick={() => onRetry(s.key)}
                >
                  <RotateCw className="h-3 w-3" /> Retry
                </Button>
              )}
            </div>
            {isFailed && s.errorLabel && (
              <div className="pl-[22px] text-[10.5px] text-destructive">{s.errorLabel}</div>
            )}
            {showNoteInput && onNote && s.status === "staged" && (
              <input
                type="text"
                value={s.note ?? ""}
                onChange={(e) => onNote(s.key, e.target.value)}
                placeholder="Add a note (optional)"
                className="mt-0.5 w-full rounded-md border border-border/50 bg-background/40 px-2 py-1 text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:border-primary/40 focus:outline-none"
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
