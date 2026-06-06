// BulkConnectSheet — connect many captures to one target in a single tap.
// Doctrine: linking is metadata only. Each link writes its own audit
// receipt via cross_links_create. Failures show up at the end as a
// toast — partial success is fine, the user keeps a clean list.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, Check, FileText, CheckSquare, Hammer, File as FileIcon, MessageSquare, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { vantaToast as toast } from "@/lib/vantaVoice";
import {
  createCrossLink, searchTargets, RELATIONS, KIND_LABEL,
  type CrossKind, type CrossRelation,
} from "@/lib/crossLinks";

const KIND_ICON: Record<CrossKind, any> = {
  note: FileText, commitment: CheckSquare, action: Hammer, file: FileIcon,
  message: MessageSquare, capture: MessageSquare, entity: Tag,
};

type Target = { kind: CrossKind; id: string; label: string; preview?: string | null };

export function BulkConnectSheet({
  open,
  onOpenChange,
  sources,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  sources: { kind: CrossKind; id: string; label?: string }[];
  onLinked?: () => void;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Target[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Target | null>(null);
  const [relation, setRelation] = useState<CrossRelation>("related");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery(""); setResults([]); setSelected(null); setRelation("related"); setProgress(0);
  }, [open]);

  useEffect(() => {
    if (!open || !user) return;
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      const rows = await searchTargets(query, { userId: user.id, limit: 8 });
      setResults(rows);
      setSearching(false);
    }, 220);
    return () => clearTimeout(t);
  }, [query, open, user?.id]);

  const confirm = async () => {
    if (!selected || !user || sources.length === 0) return;
    setBusy(true);
    setProgress(0);
    let ok = 0, fail = 0;
    for (const src of sources) {
      if (src.kind === selected.kind && src.id === selected.id) { fail++; continue; }
      const { id } = await createCrossLink({
        source_kind: src.kind,
        source_id: src.id,
        target_kind: selected.kind,
        target_id: selected.id,
        relation,
        confidence: "medium",
        created_by: "user",
      });
      if (id) ok++; else fail++;
      setProgress((p) => p + 1);
    }
    setBusy(false);
    if (ok > 0) toast.success({ title: `Connected ${ok} item${ok === 1 ? "" : "s"} to ${selected.label}.` });
    if (fail > 0 && ok === 0) toast.message({ title: `Couldn't connect ${fail} item${fail === 1 ? "" : "s"}.` });
    onLinked?.();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]">
        <SheetHeader className="text-left">
          <SheetTitle className="text-[14px]">Connect {sources.length} item{sources.length === 1 ? "" : "s"} to…</SheetTitle>
          <SheetDescription className="text-[11.5px]">
            Pick one place — Vanta will link all selected captures to it. Nothing runs.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3">
          <div className="rounded-md border border-border/40 bg-muted/20 p-2 text-[11px] text-muted-foreground">
            <div className="mb-1 font-medium text-foreground/80">Selected captures</div>
            <ul className="space-y-0.5">
              {sources.slice(0, 4).map((s) => (
                <li key={`${s.kind}:${s.id}`} className="truncate">• {s.label ?? `${KIND_LABEL[s.kind]} ${s.id.slice(0, 6)}`}</li>
              ))}
              {sources.length > 4 && <li className="italic">+ {sources.length - 4} more</li>}
            </ul>
          </div>

          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a project, note, commitment…"
              className="h-9 pl-7 text-[12.5px]"
              autoFocus
            />
          </div>

          {searching && (
            <div className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Looking…
            </div>
          )}
          {!searching && query && results.length === 0 && (
            <p className="text-[11px] text-muted-foreground">Nothing matched.</p>
          )}
          {results.length > 0 && (
            <ul className="space-y-1">
              {results.map((r) => {
                const Icon = KIND_ICON[r.kind];
                const active = selected?.kind === r.kind && selected.id === r.id;
                return (
                  <li key={`${r.kind}:${r.id}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(r)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors",
                        active ? "border-primary/40 bg-primary/10" : "border-border/50 bg-surface-elevated/40 hover:border-border",
                      )}
                    >
                      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[12px] font-medium text-foreground/90">{r.label}</span>
                          <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">{KIND_LABEL[r.kind]}</span>
                        </div>
                        {r.preview && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{r.preview}</p>}
                      </div>
                      {active && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <div className="mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">How are they related?</div>
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
          </div>

          <div className="sticky bottom-0 -mx-6 border-t border-border/60 bg-background/95 px-6 py-3 backdrop-blur">
            <Button onClick={confirm} disabled={!selected || busy} className="h-10 w-full text-[12.5px]">
              {busy
                ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Connecting {progress}/{sources.length}…</>
                : selected
                  ? `Connect ${sources.length} → ${selected.label.slice(0, 30)}`
                  : "Pick where to connect them"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
