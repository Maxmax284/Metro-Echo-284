// Reusable picker: surfaces suggested items (matched against a typed title)
// and recent captures (always visible). Used by the New Project composer
// (slice 2a) and will be reused by the in-project "+ Add" composer (slice 2b).
import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadDraftCandidates,
  type DraftCandidates,
  type SuggestedItem,
} from "@/lib/projectSuggestions";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Loader2, MessageSquare, Notebook, Paperclip,
  CheckSquare, ScrollText,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const TYPE_META: Record<
  SuggestedItem["type"],
  { label: string; icon: React.ComponentType<{ className?: string }> }
> = {
  note: { label: "Note", icon: Notebook },
  capture: { label: "Capture", icon: MessageSquare },
  file: { label: "File", icon: Paperclip },
  commitment: { label: "Commitment", icon: CheckSquare },
  action: { label: "Action", icon: ScrollText },
};

interface Props {
  userId: string;
  organizationId: string | null;
  title: string;
  summary?: string;
  selected: Set<string>; // keys are `${type}:${id}`
  onToggle: (item: SuggestedItem) => void;
  /** ms debounce on title/summary changes; default 400ms */
  debounceMs?: number;
}

export function SeedItemsPicker({
  userId, organizationId, title, summary,
  selected, onToggle, debounceMs = 400,
}: Props) {
  const [data, setData] = useState<DraftCandidates | null>(null);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef<number | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setLoading(true);
    timerRef.current = window.setTimeout(async () => {
      const myReq = ++reqIdRef.current;
      try {
        const result = await loadDraftCandidates({
          userId, organizationId, title, summary,
        });
        if (myReq === reqIdRef.current) setData(result);
      } catch (err) {
        console.error("[seed-picker] load failed", err);
        if (myReq === reqIdRef.current) setData({ suggestions: [], recentCaptures: [] });
      } finally {
        if (myReq === reqIdRef.current) setLoading(false);
      }
    }, debounceMs);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [userId, organizationId, title, summary, debounceMs]);

  const hasTitle = useMemo(() => title.trim().length >= 3, [title]);

  return (
    <div className="space-y-3">
      {/* Suggestions */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Suggested
          </span>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        {!hasTitle ? (
          <p className="rounded-md border border-dashed border-border/50 px-3 py-2 text-[11.5px] text-muted-foreground">
            Type a title to see related items.
          </p>
        ) : data === null || (loading && data.suggestions.length === 0) ? (
          <p className="rounded-md border border-dashed border-border/50 px-3 py-2 text-[11.5px] text-muted-foreground">
            Looking…
          </p>
        ) : data.suggestions.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/50 px-3 py-2 text-[11.5px] text-muted-foreground">
            Nothing obvious matches yet. You can still seed from recent captures below.
          </p>
        ) : (
          <ItemList items={data.suggestions} selected={selected} onToggle={onToggle} />
        )}
      </div>

      {/* Recent captures — always visible */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Recent captures
          </span>
        </div>
        {data === null ? (
          <p className="rounded-md border border-dashed border-border/50 px-3 py-2 text-[11.5px] text-muted-foreground">
            Loading recent…
          </p>
        ) : data.recentCaptures.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/50 px-3 py-2 text-[11.5px] text-muted-foreground">
            No recent captures in this scope.
          </p>
        ) : (
          <ItemList items={data.recentCaptures} selected={selected} onToggle={onToggle} />
        )}
      </div>
    </div>
  );
}

function ItemList({
  items, selected, onToggle,
}: { items: SuggestedItem[]; selected: Set<string>; onToggle: (it: SuggestedItem) => void }) {
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const meta = TYPE_META[it.type];
        const Icon = meta.icon;
        const key = `${it.type}:${it.id}`;
        const checked = selected.has(key);
        return (
          <li key={key}>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 transition-colors ${
                checked ? "border-primary/40 bg-primary/5" : "border-border/40 bg-background/40 hover:border-border/70"
              }`}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={() => onToggle(it)}
                className="mt-0.5"
              />
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground/70">
                    {formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-sm">{it.label}</p>
                {it.snippet && it.snippet !== it.label && (
                  <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">
                    {it.snippet}
                  </p>
                )}
              </div>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
