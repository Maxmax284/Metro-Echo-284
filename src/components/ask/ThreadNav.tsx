// ThreadNav — moving around a long situation without an outline tree.
//
// Four honest affordances and nothing more: jump to the start, jump to the
// newest, search inside this thread, and a short list of landmarks. Landmarks
// are the person's own asks — a real turning point in the situation, not an
// invented chapter heading.
//
// It appears only once a thread is long enough to need it.
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ArrowDown, Search, X, Milestone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type NavMsg = { role: string; content: string };

export const THREAD_NAV_MIN = 8;

/** Message indexes whose content matches every word of the query. */
export function searchMatches(msgs: NavMsg[], query: string): number[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const words = q.split(/\s+/);
  const out: number[] = [];
  msgs.forEach((m, i) => {
    const hay = (m.content ?? "").toLowerCase();
    if (words.every((w) => hay.includes(w))) out.push(i);
  });
  return out;
}

/** The person's own asks, shortened. The turns a situation actually pivots on. */
export function landmarks(msgs: NavMsg[], limit = 12): { index: number; label: string }[] {
  const marks: { index: number; label: string }[] = [];
  msgs.forEach((m, i) => {
    if (m.role !== "user") return;
    const label = (m.content ?? "").trim().replace(/\s+/g, " ");
    if (!label) return;
    marks.push({ index: i, label: label.length > 48 ? `${label.slice(0, 47)}…` : label });
  });
  return marks.slice(-limit);
}

function scrollToMsg(index: number) {
  document.getElementById(`ask-msg-${index}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

export function ThreadNav({
  msgs,
  scrollRef,
}: {
  msgs: NavMsg[];
  scrollRef: React.RefObject<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const matches = useMemo(() => searchMatches(msgs, query), [msgs, query]);
  const marks = useMemo(() => landmarks(msgs), [msgs]);

  useEffect(() => { setCursor(0); }, [query]);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  if (msgs.length < THREAD_NAV_MIN) return null;

  const go = (delta: number) => {
    if (!matches.length) return;
    const next = (cursor + delta + matches.length) % matches.length;
    setCursor(next);
    scrollToMsg(matches[next]);
  };

  const top = () => scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  const bottom = () =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 bg-surface-elevated/20 px-4 py-1.5">
      <button
        type="button"
        onClick={top}
        className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border/60 px-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowUp className="h-3 w-3" /> Start
      </button>
      <button
        type="button"
        onClick={bottom}
        className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border/60 px-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowDown className="h-3 w-3" /> Newest
      </button>

      {marks.length > 1 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border/60 px-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <Milestone className="h-3 w-3" /> Points
              <ChevronDown className="h-3 w-3" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-[min(320px,88vw)] p-1">
            <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              What you asked
            </p>
            <div className="max-h-64 overflow-y-auto">
              {marks.map((m) => (
                <button
                  key={m.index}
                  type="button"
                  onClick={() => scrollToMsg(m.index)}
                  className="block w-full truncate rounded-[3px] px-2 py-2 text-left text-[12.5px] text-foreground/90 hover:bg-muted/40"
                >
                  {m.label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {open ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
              }}
              placeholder="Search this thread"
              className="h-9 w-full rounded-full border border-border/60 bg-background/70 pl-7 pr-2 text-[12px] outline-none focus:border-primary/40"
            />
          </div>
          <span className={cn("shrink-0 font-mono text-[10px]", matches.length ? "text-muted-foreground" : "text-warn")}>
            {query.trim() ? (matches.length ? `${cursor + 1}/${matches.length}` : "none") : ""}
          </span>
          <button type="button" onClick={() => go(-1)} className="min-h-[36px] px-1 text-muted-foreground hover:text-foreground" aria-label="Previous match">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => go(1)} className="min-h-[36px] px-1 text-muted-foreground hover:text-foreground" aria-label="Next match">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={() => { setOpen(false); setQuery(""); }} className="min-h-[36px] px-1 text-muted-foreground hover:text-foreground" aria-label="Close search">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-border/60 px-2.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
        >
          <Search className="h-3 w-3" /> Find
        </button>
      )}
    </div>
  );
}

/** The "jump to latest" pill — only while the newest turn is off screen. */
export function JumpToLatest({ scrollRef, deps }: { scrollRef: React.RefObject<HTMLDivElement>; deps: unknown }) {
  const [away, setAway] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => setAway(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
    check();
    el.addEventListener("scroll", check, { passive: true });
    return () => el.removeEventListener("scroll", check);
  }, [scrollRef, deps]);

  if (!away) return null;
  return (
    <button
      type="button"
      onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
      className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full border border-primary/40 bg-background/95 px-3 py-1.5 text-[11.5px] text-foreground shadow-sm backdrop-blur md:bottom-20"
    >
      Jump to latest
    </button>
  );
}
