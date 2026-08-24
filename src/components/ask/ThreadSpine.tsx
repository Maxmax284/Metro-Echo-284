// ThreadSpine — restrained thread navigation for Ask.
// Desktop: a narrow left rail inside the Ask room.
// Mobile: the same list inside a sheet, opened from the thread bar.
import { useState } from "react";
import {
  Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2, Link2, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { outputSummary, relTime, threadLabel, type AskThread } from "@/lib/askThreads";
import { useScope } from "@/hooks/useScope";
import { useAskStreaming } from "@/hooks/useAskStreaming";


function LiveDot({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1" title={label} aria-label={label}>
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inset-0 rounded-full bg-accent/60 motion-breath motion-reduce:animate-none" />
        <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    </span>
  );
}

function ThreadRow({ t, onPicked }: { t: AskThread; onPicked?: () => void }) {
  const { activeId, openThread, rename, togglePin, archive, remove } = useAskThreads();
  const active = t.id === activeId;
  const archived = !!t.archived_at;
  const streaming = useAskStreaming(t.id);


  const doRename = () => {
    const next = window.prompt("Rename thread", threadLabel(t));
    if (next) void rename(t.id, next);
  };

  return (
    <div
      className={cn(
        "group/thread flex items-start gap-1 rounded-lg px-2 py-2 transition-colors",
        active ? "bg-surface-elevated ring-1 ring-primary/25" : "hover:bg-surface-elevated/60",
      )}
    >
      <button
        type="button"
        onClick={() => { openThread(t.id); onPicked?.(); }}
        className="vanta-focus min-h-[44px] min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-1.5">
          {t.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
          <span className="truncate text-[13px] text-foreground/90">{threadLabel(t)}</span>
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-mono">{relTime(t.last_message_at ?? t.updated_at)}</span>
          <span className="rounded-full bg-surface-elevated/70 px-1.5 py-0.5 uppercase tracking-wider ring-1 ring-border/40">
            {t.scope === "organization" ? "Workspace" : "Personal"}
          </span>
          {t.context_label && (
            <span className="inline-flex items-center gap-1 truncate text-foreground/70">
              <Link2 className="h-2.5 w-2.5" />
              {t.context_label}
            </span>
          )}
          {archived && <span className="text-muted-foreground/70">archived</span>}
        </span>
        {outputSummary(t.outputs) && (
          <span className="mt-0.5 block font-mono text-[10px] text-primary/80">
            {outputSummary(t.outputs)}
          </span>
        )}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label={`Thread options for ${threadLabel(t)}`}>
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={doRename}><Pencil className="mr-2 h-3.5 w-3.5" />Rename</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void togglePin(t.id)}>
            {t.pinned ? <PinOff className="mr-2 h-3.5 w-3.5" /> : <Pin className="mr-2 h-3.5 w-3.5" />}
            {t.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void archive(t.id, !archived)}>
            {archived ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> : <Archive className="mr-2 h-3.5 w-3.5" />}
            {archived ? "Restore" : "Archive"}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => { if (window.confirm("Delete this thread? It leaves a receipt.")) void remove(t.id); }}
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ThreadList({ onPicked }: { onPicked?: () => void }) {
  const { threads, archived, newThread } = useAskThreads();
  const { destination } = useScope();
  const [showArchived, setShowArchived] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 px-2 pb-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{destination}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-[12px]"
          onClick={() => { void newThread(); onPicked?.(); }}
        >
          <Plus className="h-3.5 w-3.5" />New
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto pb-4">
        {threads.length === 0 && (
          <p className="px-2 py-6 text-[12px] leading-relaxed text-muted-foreground">
            No threads in this room yet. Ask something, or open Ask from a project — the thread
            keeps that context so you never re-explain it.
          </p>
        )}
        {threads.map((t) => <ThreadRow key={t.id} t={t} onPicked={onPicked} />)}
        {archived.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="vanta-focus w-full rounded-md px-2 py-2 text-left text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showArchived ? "Hide" : "Show"} archived ({archived.length})
            </button>
            {showArchived && archived.map((t) => <ThreadRow key={t.id} t={t} onPicked={onPicked} />)}
          </div>
        )}
      </div>
    </div>
  );
}

/** Desktop rail. Hidden on small screens. */
export function ThreadRail() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-border/50 py-3 md:block" aria-label="Ask threads">
      <ThreadList />
    </aside>
  );
}

/** Mobile bar + sheet picker. */
export function ThreadBar() {
  const [open, setOpen] = useState(false);
  const { active, threads } = useAskThreads();
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="vanta-focus flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-elevated/50 px-2.5 text-left ring-1 ring-border/40"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] text-foreground/90">
            {active ? threadLabel(active) : "New thread"}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {threads.length} thread{threads.length === 1 ? "" : "s"} in this room · tap to switch
          </span>
        </span>
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-3">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-sm">Ask threads</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100dvh-6rem)]">
            <ThreadList onPicked={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
