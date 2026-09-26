// ThreadSpine — restrained thread navigation for Ask.
// Desktop: a narrow left rail inside the Ask room.
// Mobile: the same list inside a sheet, opened from the thread bar.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive, ArchiveRestore, MoreHorizontal, Pencil, Pin, PinOff, Plus, Trash2, Link2, MessageSquare, Square,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { matchesQuery, outputSummary, relTime, threadLabel, type AskThread } from "@/lib/askThreads";
import { useScope } from "@/hooks/useScope";
import { SectionNote } from "@/components/ui/section-note";
import { sectionNote } from "@/lib/roomCopy";
import { ExplainThisButton } from "@/components/ask/ExplainThisButton";
import { WhatEchoCanDo } from "@/components/ask/WhatEchoCanDo";
import { useAskStreaming } from "@/hooks/useAskStreaming";
import { stopAskStream } from "@/lib/askSession";
import {
  groupByDay, isUnread, markSeen, readSeen, threadInitials, unreadCount,
} from "@/lib/threadShelf";
import { useEdgeSwipe } from "@/hooks/useEdgeSwipe";


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

function ThreadRow({
  t, onPicked, unread, onSeen,
}: { t: AskThread; onPicked?: () => void; unread?: boolean; onSeen?: (id: string) => void }) {
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
        onClick={() => { openThread(t.id); markSeen(t.id); onSeen?.(t.id); onPicked?.(); }}
        className="vanta-focus min-h-[44px] min-w-0 flex-1 text-left"
      >
        <span className="flex items-center gap-1.5">
          {t.pinned && <Pin className="h-3 w-3 shrink-0 text-primary" />}
          {unread && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              title="Moved since you last read it"
              aria-label="Moved since you last read it"
            />
          )}
          <span
            className={cn(
              "truncate text-[13px]",
              unread ? "font-medium text-foreground" : "text-foreground/90",
            )}
          >
            {threadLabel(t)}
          </span>
          {streaming && <LiveDot label="Answering now" />}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="font-mono">
            {streaming ? "answering now" : relTime(t.last_message_at ?? t.updated_at)}
          </span>
          {unread && !streaming && <span className="text-primary/85">new since you looked</span>}

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
      {streaming && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
          aria-label={`Stop answering ${threadLabel(t)}`}
          title="Stop answering"
          onClick={(e) => { e.stopPropagation(); stopAskStream(t.id); }}
        >
          <Square className="h-3 w-3 fill-current" />
        </Button>
      )}
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
  // Search reads what a thread carries — its title and the record it is bound
  // to. Nothing here pretends to search inside the conversation.
  const [q, setQ] = useState("");
  const live = threads.filter((t) => matchesQuery(t, q));
  const pinned = live.filter((t) => t.pinned);
  const recent = live.filter((t) => !t.pinned);
  const archivedHits = archived.filter((t) => matchesQuery(t, q));
  const searching = q.trim().length > 0;
  // Unread marks live on the device, not the record: they say what this device
  // has already looked at, and reading a thread is what clears them.
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => { setSeen(readSeen()); }, [threads]);
  const noteSeen = useCallback((id: string) => setSeen((p) => ({ ...p, [id]: new Date().toISOString() })), []);
  // Unpinned threads shelve by the day they last moved, so the list reads as
  // days rather than one endless log.
  const days = useMemo(() => groupByDay(recent), [recent]);


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
      <SectionNote className="mt-0 px-2 pb-2" sectionKey="ask.threads">
        {sectionNote("ask.threads")}
      </SectionNote>
      {threads.length + archived.length > 4 ? (
        <div className="px-2 pb-2">
          <label htmlFor="ask-thread-search" className="sr-only">
            Search threads by name or the record they are about
          </label>
          <input
            id="ask-thread-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search threads"
            className="vanta-focus h-9 w-full rounded-md bg-muted/25 px-2.5 text-[12.5px] ring-1 ring-border/50 placeholder:text-muted-foreground/70"
          />
        </div>
      ) : null}
      <div className="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto pb-4">
        {threads.length === 0 && (
          <p className="px-2 py-6 text-[12px] leading-relaxed text-muted-foreground">
            No threads in this room yet. Say something, or open Echo from a project — the thread
            keeps that context so you never re-explain it.
          </p>
        )}
        {threads.length > 0 && searching && live.length === 0 && archivedHits.length === 0 && (
          <p className="px-2 py-6 text-[12px] leading-relaxed text-muted-foreground">
            Nothing here matches “{q.trim()}”. Search reads thread names and the record a thread is
            about, not the words inside it.
          </p>
        )}
        {/* Pinned first, under its own label, so the spine reads as an ordered
            workspace rather than one long log. */}
        {pinned.length > 0 && (
          <>
            <GroupLabel>Pinned</GroupLabel>
            {pinned.map((t) => (
              <ThreadRow key={t.id} t={t} onPicked={onPicked} unread={isUnread(t, seen)} onSeen={noteSeen} />
            ))}
          </>
        )}
        {days.map((group) => (
          <div key={group.label}>
            <GroupLabel>{group.label}</GroupLabel>
            {group.threads.map((t) => (
              <ThreadRow key={t.id} t={t} onPicked={onPicked} unread={isUnread(t, seen)} onSeen={noteSeen} />
            ))}
          </div>
        ))}
        {archivedHits.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="vanta-focus w-full rounded-md px-2 py-2 text-left text-[11px] text-muted-foreground hover:text-foreground"
            >
              {showArchived || searching ? "Hide" : "Show"} archived ({archivedHits.length})
            </button>
            {(showArchived || searching) && (
              <>
                <GroupLabel>Archived</GroupLabel>
                {archivedHits.map((t) => <ThreadRow key={t.id} t={t} onPicked={onPicked} />)}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: string }) {
  return (
    <p className="vanta-machine-label px-2 pb-1 pt-2 text-muted-foreground/70">{children}</p>
  );
}

const RAIL_KEY = "vanta.ask.rail.collapsed";

function readRailCollapsed(): boolean {
  try { return window.localStorage.getItem(RAIL_KEY) === "1"; } catch { return false; }
}

/**
 * Desktop rail. Collapsible, because a long situation deserves the full width
 * and the list should not be the price of reading it. Collapsed it keeps a
 * narrow strip — a way back, a New thread button, and how many threads are
 * waiting — so the list is never more than one tap away. The choice is
 * remembered per device.
 */
export function ThreadRail() {
  const [collapsed, setCollapsed] = useState(readRailCollapsed);
  const { threads, newThread, openThread, activeId } = useAskThreads();
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => { setSeen(readSeen()); }, [threads]);
  const pinned = threads.filter((t) => t.pinned).slice(0, 6);
  const unread = unreadCount(threads, seen);

  const set = (v: boolean) => {
    setCollapsed(v);
    try { window.localStorage.setItem(RAIL_KEY, v ? "1" : "0"); } catch { /* private mode */ }
  };

  if (collapsed) {
    return (
      <aside
        className="hidden w-12 shrink-0 flex-col items-center gap-1 border-r border-border/50 py-3 md:flex"
        aria-label="Echo threads, collapsed"
      >
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => set(false)}
          aria-label="Show threads"
          title="Show threads"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void newThread()}
          aria-label="New thread"
          title="New thread"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <span
          className="mt-0.5 font-mono text-[10px] text-muted-foreground"
          title={`${threads.length} thread${threads.length === 1 ? "" : "s"} in this room`}
        >
          {threads.length}
        </span>
        {unread > 0 && (
          <span
            className="rounded-full bg-primary/15 px-1.5 font-mono text-[10px] text-primary"
            title={`${unread} thread${unread === 1 ? "" : "s"} moved since you looked`}
          >
            {unread}
          </span>
        )}
        {/* Pinned threads stay reachable while the rail is shut — two letters
            each, so the strip stays a strip. */}
        {pinned.length > 0 && (
          <div className="mt-2 flex flex-col items-center gap-1 border-t border-border/40 pt-2">
            {pinned.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { openThread(t.id); markSeen(t.id); setSeen(readSeen()); }}
                title={threadLabel(t)}
                aria-label={`Open ${threadLabel(t)}`}
                className={cn(
                  "vanta-focus relative flex h-8 w-8 items-center justify-center rounded-md font-mono text-[10px] transition-colors",
                  t.id === activeId
                    ? "bg-surface-elevated text-foreground ring-1 ring-primary/30"
                    : "text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground",
                )}
              >
                {threadInitials(t)}
                {isUnread(t, seen) && (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border/50 bg-background/55 py-3 backdrop-blur-md md:flex" aria-label="Echo threads">
      <div className="flex items-center gap-1 px-2 pb-1">
        <span className="vanta-machine-label text-foreground/70">Echo</span>
        <WhatEchoCanDo className="ml-auto" />
        <ExplainThisButton room="ask" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => set(true)}
          aria-label="Hide threads"
          title="Hide threads"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <ThreadList />
      </div>
    </aside>
  );
}

/** Mobile bar + sheet picker. */
export function ThreadBar() {
  const [open, setOpen] = useState(false);
  const { active, threads } = useAskThreads();
  const streaming = useAskStreaming(active?.id);
  const [seen, setSeen] = useState(readSeen);
  useEffect(() => { setSeen(readSeen()); }, [threads]);
  const unread = unreadCount(threads, seen);
  // Pull in from the left edge to reach the threads, the way a phone expects.
  useEdgeSwipe(useCallback(() => setOpen(true), []));
  return (
    <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 md:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="vanta-focus flex min-h-[44px] min-w-0 flex-1 items-center gap-2 rounded-lg bg-surface-elevated/50 px-2.5 text-left ring-1 ring-border/40"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 text-primary/80" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] text-foreground/90">
              {active ? threadLabel(active) : "New thread"}
            </span>
            {streaming && <LiveDot label="Answering now" />}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">
            {streaming
              ? "answering now · tap or swipe in to switch"
              : unread > 0
                ? `${unread} moved since you looked · tap or swipe in to switch`
                : `${threads.length} thread${threads.length === 1 ? "" : "s"} in this room · tap or swipe in to switch`}
          </span>
        </span>
      </button>
      <WhatEchoCanDo />
      <ExplainThisButton room="ask" />
      {streaming && active && (
        <Button
          variant="outline"
          size="sm"
          className="h-9 shrink-0 gap-1.5 px-2.5 text-[12px]"
          onClick={() => stopAskStream(active.id)}
        >
          <Square className="h-3 w-3 fill-current" />Stop
        </Button>
      )}



      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-sm p-3">
          <SheetHeader className="pb-2">
            <SheetTitle className="text-sm">Echo threads</SheetTitle>
          </SheetHeader>
          <div className="h-[calc(100dvh-6rem)]">
            <ThreadList onPicked={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
