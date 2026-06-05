// ConnectSheet — the universal "Connect to…" bottom sheet.
//
// Doctrine:
//   - capture never executes; linking is metadata only.
//   - Sherlock suggests; the user approves with a tap.
//   - every link writes an audit receipt via cross_links_create RPC.
//   - mobile-first at 384px: bottom sheet, big tap rows, single confirm action.
import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Sparkles, Check, FileText, CheckSquare, Hammer, File as FileIcon, MessageSquare, Tag, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import {
  createCrossLink, searchTargets, suggestForItem,
  RELATIONS, KIND_LABEL,
  type CrossKind, type CrossRelation, type LinkSuggestion,
} from "@/lib/crossLinks";

const KIND_ICON: Record<CrossKind, any> = {
  note: FileText, commitment: CheckSquare, action: Hammer, file: FileIcon,
  message: MessageSquare, capture: MessageSquare, entity: Tag,
};

type Target = { kind: CrossKind; id: string; label: string; preview?: string | null };

export function ConnectSheet({
  open,
  onOpenChange,
  source,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  source: { kind: CrossKind; id: string; label?: string };
  onLinked?: () => void;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Target[]>([]);
  const [searching, setSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [selected, setSelected] = useState<Target | null>(null);
  const [relation, setRelation] = useState<CrossRelation>("related");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setQuery(""); setResults([]); setSelected(null); setRelation("related");
    setLoadingSuggestions(true);
    suggestForItem({ source_kind: source.kind, source_id: source.id, userId: user.id })
      .then((s) => setSuggestions(s))
      .finally(() => setLoadingSuggestions(false));
  }, [open, user?.id, source.kind, source.id]);

  // Debounced search.
  useEffect(() => {
    if (!open || !user) return;
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const rows = await searchTargets(query, {
        userId: user.id, excludeKind: source.kind, excludeId: source.id, limit: 6,
      });
      setResults(rows);
      setSearching(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query, open, user?.id, source.kind, source.id]);

  const onPick = (t: Target, suggestedRelation?: CrossRelation) => {
    setSelected(t);
    if (suggestedRelation) setRelation(suggestedRelation);
  };

  const confirm = async () => {
    if (!selected || !user) return;
    setBusy(true);
    try {
      const { id, error } = await createCrossLink({
        source_kind: source.kind,
        source_id: source.id,
        target_kind: selected.kind,
        target_id: selected.id,
        relation,
        confidence: "medium",
        created_by: "user",
      });
      if (!id || error) {
        toast.message({ title: error ?? "Could not connect that." });
        return;
      }
      toast.success({ title: `Connected to ${selected.label}.` });
      onLinked?.();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const sourceLabel = source.label ? `"${source.label.slice(0, 60)}"` : KIND_LABEL[source.kind].toLowerCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-[14px]">Connect to…</SheetTitle>
          <SheetDescription className="text-[11.5px]">
            Linking is metadata. Nothing runs — you can unlink any time.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          {/* SEARCH */}
          <div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search anything to connect to ${sourceLabel}…`}
                className="h-9 pl-7 text-[12.5px]"
                autoFocus
              />
            </div>
            {searching && (
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Looking…
              </div>
            )}
            {!searching && query && results.length === 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">Nothing matched.</p>
            )}
            {results.length > 0 && (
              <ul className="mt-2 space-y-1">
                {results.map((r) => (
                  <ResultRow
                    key={`${r.kind}:${r.id}`}
                    target={r}
                    active={selected?.kind === r.kind && selected.id === r.id}
                    onPick={() => onPick(r)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* SUGGESTIONS */}
          {!query && (
            <div>
              <div className="mb-1.5 inline-flex items-center gap-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
                <Sparkles className="h-3 w-3" /> Suggested
              </div>
              {loadingSuggestions && (
                <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Thinking…
                </div>
              )}
              {!loadingSuggestions && suggestions.length === 0 && (
                <p className="text-[11px] italic text-muted-foreground">
                  No automatic guesses. Search above to connect manually.
                </p>
              )}
              <ul className="space-y-1">
                {suggestions.map((s, i) => (
                  <SuggestionRow
                    key={`${s.target_kind}:${s.target_id}:${i}`}
                    suggestion={s}
                    active={selected?.kind === s.target_kind && selected.id === s.target_id}
                    onPick={() => onPick(
                      { kind: s.target_kind, id: s.target_id, label: s.target_label },
                      s.relation,
                    )}
                  />
                ))}
              </ul>
            </div>
          )}

          {/* RELATION */}
          <div>
            <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
              Relation
            </div>
            <div className="flex flex-wrap gap-1.5">
              {RELATIONS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setRelation(r.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    relation === r.id
                      ? "border-primary/40 bg-primary/15 text-primary"
                      : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
                  )}
                  title={r.hint}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10.5px] italic text-muted-foreground/80">
              {RELATIONS.find((r) => r.id === relation)?.hint}
            </p>
          </div>

          {/* CONFIRM */}
          <div className="sticky bottom-0 -mx-6 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
            <Button
              onClick={confirm}
              disabled={!selected || busy}
              className="h-10 w-full text-[12.5px]"
            >
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {selected ? `Connect → ${selected.label.slice(0, 40)}` : "Pick something to connect"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ResultRow({ target, active, onPick }: { target: Target; active: boolean; onPick: () => void }) {
  const Icon = KIND_ICON[target.kind];
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
          active
            ? "border-primary/40 bg-primary/10"
            : "border-border/50 bg-surface-elevated/40 hover:border-border",
        )}
      >
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-medium text-foreground/90">{target.label}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              {KIND_LABEL[target.kind]}
            </span>
          </div>
          {target.preview && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{target.preview}</p>
          )}
        </div>
        {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
      </button>
    </li>
  );
}

function SuggestionRow({ suggestion, active, onPick }: { suggestion: LinkSuggestion; active: boolean; onPick: () => void }) {
  const Icon = KIND_ICON[suggestion.target_kind];
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className={cn(
          "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
          active
            ? "border-primary/40 bg-primary/10"
            : "border-border/50 bg-surface-elevated/40 hover:border-border",
        )}
      >
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-medium text-foreground/90">{suggestion.target_label}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              {suggestion.relation.replace("_", " ")}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{suggestion.why}</p>
        </div>
        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
    </li>
  );
}
