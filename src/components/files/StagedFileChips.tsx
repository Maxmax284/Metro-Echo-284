// Staged file chip row — used in FileUploadCard, ConversationSurface,
// and the Command Files tile. One mental model everywhere.
// Multi-file uploads from one stage() call get grouped under a batch header.
import { useMemo } from "react";
import { FileText, Image as ImageIcon, FileAudio, FileVideo, X, RotateCw, Loader2, Check, Layers } from "lucide-react";
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

type Group = { batchId: string | undefined; items: StagedFile[] };

function groupByBatch(items: StagedFile[]): Group[] {
  const groups: Group[] = [];
  const byId = new Map<string, Group>();
  for (const s of items) {
    if (!s.batchId) {
      groups.push({ batchId: undefined, items: [s] });
      continue;
    }
    let g = byId.get(s.batchId);
    if (!g) {
      g = { batchId: s.batchId, items: [] };
      byId.set(s.batchId, g);
      groups.push(g);
    }
    g.items.push(s);
  }
  return groups;
}

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
  const groups = useMemo(() => groupByBatch(items), [items]);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Staged files">
      {groups.map((g, gi) => (
        <BatchBlock
          key={g.batchId ?? `solo-${gi}`}
          group={g}
          compact={compact}
          onRemove={onRemove}
          onRetry={onRetry}
          onNote={onNote}
          showNoteInput={showNoteInput}
        />
      ))}
    </div>
  );
}

function BatchBlock({
  group, compact, onRemove, onRetry, onNote, showNoteInput,
}: {
  group: Group;
  compact: boolean;
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  onNote?: (key: string, note: string) => void;
  showNoteInput: boolean;
}) {
  const items = group.items;
  const isBatch = !!group.batchId && items.length > 1;
  const saved = items.filter((i) => i.status === "saved").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const busy = items.filter((i) => i.status === "uploading" || i.status === "reading").length;

  return (
    <div className={cn(isBatch && "rounded-2xl border border-border/50 bg-surface-elevated/30 p-2 ring-1 ring-border/30")}>
      {isBatch && (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <Layers className="h-3 w-3" />
          <span>Batch · {items.length} files</span>
          <span aria-hidden>·</span>
          <span>{saved} saved{busy ? ` · ${busy} reading` : ""}{failed ? ` · ${failed} failed` : ""}</span>
        </div>
      )}
      <ul className={cn("flex flex-col gap-1.5", compact ? "text-[11px]" : "text-[12px]")}>
        {items.map((s) => (
          <ChipRow
            key={s.key}
            s={s}
            onRemove={onRemove}
            onRetry={onRetry}
            onNote={onNote}
            showNoteInput={showNoteInput}
          />
        ))}
      </ul>
    </div>
  );
}

function ChipRow({
  s, onRemove, onRetry, onNote, showNoteInput,
}: {
  s: StagedFile;
  onRemove: (key: string) => void;
  onRetry?: (key: string) => void;
  onNote?: (key: string, note: string) => void;
  showNoteInput: boolean;
}) {
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
