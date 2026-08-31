// DocumentCompareSheet — read two versions side by side, in plain terms.
//
// Doctrine: descriptive only. It shows what the text says changed, groups the
// changes that matter (dates, amounts, parties, obligations), and says out loud
// what it cannot settle. It writes nothing and advises nothing.
import { useEffect, useMemo, useState } from "react";
import { GitCompare, Loader2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { listVersions, type DocumentVersion } from "@/lib/documents";
import {
  CHANGE_KIND_LABEL,
  compareVersions,
  diffHeadline,
  type ChangeKind,
} from "@/lib/documentDiff";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function DocumentCompareSheet({
  documentId,
  title,
  open,
  onOpenChange,
}: {
  documentId: string;
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    setError(null);
    listVersions(documentId)
      .then((rows) => {
        if (!alive) return;
        setVersions(rows);
        /* Default to the most recent change: newest against the one before. */
        setAfterId(rows[0]?.id ?? null);
        setBeforeId(rows[1]?.id ?? rows[0]?.id ?? null);
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : "Versions could not be read."))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [open, documentId]);

  const before = versions.find((v) => v.id === beforeId) ?? null;
  const after = versions.find((v) => v.id === afterId) ?? null;

  const diff = useMemo(
    () => (before && after ? compareVersions(before.body_text, after.body_text) : null),
    [before, after],
  );

  const grouped = useMemo(() => {
    const map = new Map<ChangeKind, { op: "added" | "removed"; text: string }[]>();
    for (const c of diff?.noted ?? []) {
      const list = map.get(c.kind) ?? [];
      list.push({ op: c.op, text: c.text });
      map.set(c.kind, list);
    }
    return [...map.entries()];
  }, [diff]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-[15px]">
            <GitCompare className="h-4 w-4 text-primary" aria-hidden="true" />
            Compare versions
          </SheetTitle>
          <SheetDescription className="text-[12px]">
            {title} — what the text says changed. Reading only, nothing is altered.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-[12px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the versions…
          </p>
        ) : error ? (
          <p className="mt-4 text-[12px] text-danger">{error}</p>
        ) : versions.length < 2 ? (
          <p className="mt-4 text-[12px] leading-snug text-muted-foreground">
            Only one version exists so far. A second appears the first time this document is revised —
            then there is something to compare.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <VersionPicker label="Older" value={beforeId} versions={versions} onChange={setBeforeId} />
              <VersionPicker label="Newer" value={afterId} versions={versions} onChange={setAfterId} />
            </div>

            {diff && (
              <>
                <p className="text-[12.5px] font-medium text-foreground">{diffHeadline(diff)}</p>

                {grouped.length > 0 && (
                  <div className="space-y-2">
                    {grouped.map(([kind, items]) => (
                      <div key={kind} className="rounded-[2px] border border-border/60 p-2">
                        <p className="text-[10px] uppercase tracking-wider text-primary/90">
                          {CHANGE_KIND_LABEL[kind]}
                        </p>
                        <ul className="mt-1 space-y-1">
                          {items.map((it, i) => (
                            <li key={i} className="text-[11.5px] leading-snug">
                              <span
                                className={cn(
                                  "mr-1 font-mono text-[10px]",
                                  it.op === "added" ? "text-primary" : "text-danger",
                                )}
                              >
                                {it.op === "added" ? "+" : "−"}
                              </span>
                              <span className="text-foreground/90">{it.text}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Full text</p>
                  <div className="mt-1 max-h-[45vh] overflow-y-auto rounded-[2px] border border-border/60 p-2">
                    {diff.lines.map((l, i) => (
                      <p
                        key={i}
                        className={cn(
                          "text-[11.5px] leading-snug",
                          l.op === "added" && "bg-primary/10 text-foreground",
                          l.op === "removed" && "bg-danger/10 text-muted-foreground line-through",
                          l.op === "same" && "text-muted-foreground/80",
                        )}
                      >
                        {l.op === "added" ? "+ " : l.op === "removed" ? "− " : "  "}
                        {l.text}
                      </p>
                    ))}
                  </div>
                </div>

                {diff.uncertainty.length > 0 && (
                  <div className="rounded-[2px] border border-dashed border-border/60 p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      What this cannot settle
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {diff.uncertainty.map((u, i) => (
                        <li key={i} className="text-[11px] leading-snug text-muted-foreground">
                          {u}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}

            <AftermathHint text="Comparing changes nothing · both versions stay exactly as they are" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function VersionPicker({
  label,
  value,
  versions,
  onChange,
}: {
  label: string;
  value: string | null;
  versions: DocumentVersion[];
  onChange: (id: string) => void;
}) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mt-1 w-full rounded-[2px] border border-border/60 bg-background px-2 py-1.5 text-[11.5px]",
          MOTION_FOCUS,
        )}
      >
        {versions.map((v) => (
          <option key={v.id} value={v.id}>
            Version {v.version_no} · {v.source}
          </option>
        ))}
      </select>
    </label>
  );
}
