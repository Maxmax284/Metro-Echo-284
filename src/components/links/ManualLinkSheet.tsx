// ManualLinkSheet — universal "link any two things" dialog. Open from the
// Memory header (or anywhere) when there is no pre-selected source. The
// user picks A, then B, picks a relation, taps Connect. Same audit path
// as ConnectSheet — calls cross_links_create RPC.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ArrowRight, X, FileText, CheckSquare, Hammer, File as FileIcon, MessageSquare, Tag, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import {
  createCrossLink, searchTargets, RELATIONS, KIND_LABEL,
  type CrossKind, type CrossRelation,
} from "@/lib/crossLinks";
import { formatDistanceToNow } from "date-fns";

const KIND_ICON: Record<CrossKind, any> = {
  note: FileText, commitment: CheckSquare, action: Hammer, file: FileIcon,
  message: MessageSquare, capture: MessageSquare, entity: Tag,
};

const FILTERABLE_KINDS: CrossKind[] = ["note", "commitment", "action", "file", "entity", "message"];

type Picked = { kind: CrossKind; id: string; label: string; preview?: string | null; updated_at?: string | null };

export function ManualLinkSheet({
  open, onOpenChange, onLinked,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onLinked?: () => void;
}) {
  const { user } = useAuth();
  const [side, setSide] = useState<"A" | "B">("A");
  const [a, setA] = useState<Picked | null>(null);
  const [b, setB] = useState<Picked | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Picked[]>([]);
  const [searching, setSearching] = useState(false);
  const [kindFilters, setKindFilters] = useState<Set<CrossKind>>(new Set());
  const [relation, setRelation] = useState<CrossRelation>("related");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setSide("A"); setA(null); setB(null); setQuery(""); setResults([]);
      setRelation("related"); setBusy(false); setKindFilters(new Set());
    }
  }, [open]);

  useEffect(() => { setQuery(""); }, [side]);

  // Recents when empty, ILIKE search when typing — both kind-filtered.
  useEffect(() => {
    if (!open || !user) return;
    setSearching(true);
    const exclude = side === "A" ? a : b; // never let A and B match
    const kinds = kindFilters.size ? Array.from(kindFilters) : undefined;
    const delay = query.trim() ? 220 : 0;
    const t = setTimeout(async () => {
      const rows = await searchTargets(query, {
        userId: user.id, limit: 10,
        excludeKind: exclude?.kind, excludeId: exclude?.id,
        kinds,
      });
      setResults(rows);
      setSearching(false);
    }, delay);
    return () => clearTimeout(t);
  }, [query, open, user?.id, side, a?.id, b?.id, kindFilters]);

  const toggleKind = (k: CrossKind) => {
    setKindFilters((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  const pick = (p: Picked) => {
    if (side === "A") { setA(p); setSide(b ? "A" : "B"); }
    else { setB(p); }
    setQuery("");
  };


  const confirm = async () => {
    if (!a || !b || !user) return;
    setBusy(true);
    try {
      const { id, error } = await createCrossLink({
        source_kind: a.kind, source_id: a.id,
        target_kind: b.kind, target_id: b.id,
        relation, confidence: "medium", created_by: "user",
      });
      if (!id || error) {
        toast.message({ title: error ?? "Could not connect those." });
        return;
      }
      toast.success({ title: `Linked ${a.label.slice(0, 28)} ↔ ${b.label.slice(0, 28)}.` });
      onLinked?.();
      onOpenChange(false);
    } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-[14px]">Link two things</SheetTitle>
          <SheetDescription className="text-[11.5px]">
            Pick anything for A and B — note, commitment, reminder, action, file. Linking is metadata; nothing runs.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          {/* A ↔ B slots */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
            <SlotButton label="A" picked={a} active={side === "A"} onActivate={() => setSide("A")} onClear={() => setA(null)} />
            <div className="flex items-center justify-center text-muted-foreground">
              <ArrowRight className="h-3.5 w-3.5" />
            </div>
            <SlotButton label="B" picked={b} active={side === "B"} onActivate={() => setSide("B")} onClear={() => setB(null)} />
          </div>

          {/* Search */}
          <div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search for ${side === "A" ? "the first" : "the second"} item…`}
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
                  <ResultRow key={`${r.kind}:${r.id}`} target={r} onPick={() => pick(r)} />
                ))}
              </ul>
            )}
          </div>

          {/* Relation */}
          <div>
            <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">Relation</div>
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

          {/* Confirm */}
          <div className="sticky bottom-0 -mx-6 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
            <Button onClick={confirm} disabled={!a || !b || busy} className="h-10 w-full text-[12.5px]">
              {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {a && b ? "Link them" : "Pick both items"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SlotButton({
  label, picked, active, onActivate, onClear,
}: {
  label: string;
  picked: Picked | null;
  active: boolean;
  onActivate: () => void;
  onClear: () => void;
}) {
  const Icon = picked ? KIND_ICON[picked.kind] : null;
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2 text-left transition-colors",
        active ? "border-primary/50 bg-primary/5" : "border-border/60 bg-surface-elevated/40",
      )}
    >
      <button type="button" onClick={onActivate} className="block w-full text-left">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
        {picked ? (
          <div className="mt-0.5 flex items-start gap-1.5">
            {Icon && <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] font-medium text-foreground/90">{picked.label}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{KIND_LABEL[picked.kind]}</div>
            </div>
          </div>
        ) : (
          <div className="mt-0.5 text-[11.5px] italic text-muted-foreground">Tap, then search</div>
        )}
      </button>
      {picked && (
        <button
          type="button"
          onClick={onClear}
          className="mt-1 inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
        >
          <X className="h-2.5 w-2.5" /> clear
        </button>
      )}
    </div>
  );
}

function ResultRow({ target, onPick }: { target: Picked; onPick: () => void }) {
  const Icon = KIND_ICON[target.kind];
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-start gap-2 rounded-md border border-border/50 bg-surface-elevated/40 px-2.5 py-2 text-left transition-colors hover:border-border"
      >
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[12px] font-medium text-foreground/90">{target.label}</span>
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{KIND_LABEL[target.kind]}</span>
          </div>
          {target.preview && (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{target.preview}</p>
          )}
        </div>
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100" />
      </button>
    </li>
  );
}
