import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, User, Briefcase, MapPin, X } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

export type LinkKind = "person" | "project" | "place";
export type EntityLink = { kind: LinkKind; label: string; ref?: string | null };

type EntityKind = "note" | "commitment" | "ingested_file" | "message";

const KIND_ICON = { person: User, project: Briefcase, place: MapPin } as const;
const KIND_LABEL = { person: "person", project: "project", place: "place" } as const;

/**
 * Lightweight relationship chips stored in `metadata.links: EntityLink[]`.
 * No new tables — pure metadata. Recent-label suggestions are sourced from
 * the user's own existing links across notes/commitments/files.
 */
export function LinkChips({
  entityKind,
  entityId,
  links,
  onChange,
  compact = false,
}: {
  entityKind: EntityKind;
  entityId: string;
  links: EntityLink[];
  onChange?: (next: EntityLink[]) => void;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState<LinkKind | null>(null);
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<Record<LinkKind, string[]>>({ person: [], project: [], place: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !open) return;
    (async () => {
      // Cheap recent labels: scan recent metadata across notes, commitments,
      // files, and captured messages so labels surface wherever the user has
      // been working — not just notes.
      const [n, c, f, m] = await Promise.all([
        supabase.from("notes").select("metadata").order("updated_at", { ascending: false }).limit(120),
        supabase.from("commitments").select("metadata").order("updated_at", { ascending: false }).limit(120),
        supabase.from("ingested_files").select("metadata").order("updated_at", { ascending: false }).limit(80),
        supabase.from("messages").select("metadata").eq("role", "user").order("created_at", { ascending: false }).limit(80),
      ]);
      const buckets: Record<LinkKind, Set<string>> = { person: new Set(), project: new Set(), place: new Set() };
      const ingest = (rows: any[] | null) => {
        for (const r of rows ?? []) {
          const ls: EntityLink[] = ((r.metadata as any)?.links ?? []) as EntityLink[];
          for (const l of ls) if (buckets[l?.kind]) buckets[l.kind].add(l.label);
        }
      };
      ingest(n.data); ingest(c.data); ingest(f.data); ingest(m.data);
      setRecent({
        person: Array.from(buckets.person).slice(0, 10),
        project: Array.from(buckets.project).slice(0, 10),
        place: Array.from(buckets.place).slice(0, 10),
      });
    })();
  }, [user, open]);

  const audit = async (event: string, link: EntityLink) => {
    if (!user) return;
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: entityKind,
      entity_id: entityId,
      event,
      payload: { link },
    });
  };

  const persist = async (next: EntityLink[]) => {
    setBusy(true);
    try {
      const client = supabase as any;
      const table = entityKind === "note" ? "notes" : entityKind === "commitment" ? "commitments" : entityKind === "ingested_file" ? "ingested_files" : "messages";
      const { data: row } = await client.from(table).select("metadata").eq("id", entityId).maybeSingle();
      const meta = (row?.metadata as any) ?? {};
      await client.from(table).update({ metadata: { ...meta, links: next } }).eq("id", entityId);
      onChange?.(next);
    } finally {
      setBusy(false);
    }
  };

  const addLink = async (kind: LinkKind, label: string) => {
    const clean = label.trim();
    if (!clean) return;
    if (links.some((l) => l.kind === kind && l.label.toLowerCase() === clean.toLowerCase())) {
      toast.message({ title: "Already linked." });
      setOpen(null);
      setValue("");
      return;
    }
    const next = [...links, { kind, label: clean }];
    await persist(next);
    await audit("link.added", { kind, label: clean });
    toast.success({ title: `Linked to ${clean}.` });
    setOpen(null);
    setValue("");
  };

  const removeLink = async (link: EntityLink) => {
    const next = links.filter((l) => !(l.kind === link.kind && l.label === link.label));
    await persist(next);
    await audit("link.removed", link);
  };

  const hasLinks = links.length > 0;

  return (
    <div className={cn("space-y-1.5", compact && "text-[11px]")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {hasLinks ? (
          links.map((l) => {
            const Icon = KIND_ICON[l.kind];
            return (
              <span
                key={`${l.kind}:${l.label}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary ring-1 ring-primary/30"
              >
                <Icon className="h-3 w-3" />
                {l.label}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeLink(l); }}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-primary/20"
                  aria-label={`Unlink ${l.label}`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            );
          })
        ) : (
          <span className="text-[11px] italic text-muted-foreground">No strong links yet.</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {(["person", "project", "place"] as LinkKind[]).map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(open === k ? null : k); setValue(""); }}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                open === k
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <Plus className="h-2.5 w-2.5" />
              <Icon className="h-2.5 w-2.5" />
              {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>
      {open && (
        <div className="rounded-md bg-surface-elevated/60 p-2 ring-1 ring-border/60" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1.5">
            <Input
              autoFocus
              placeholder={`Name a ${open}…`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addLink(open, value); }}
              className="h-8 text-[12px]"
            />
            <Button size="sm" className="h-8 px-2 text-[11px]" disabled={busy || !value.trim()} onClick={() => addLink(open, value)}>
              Link
            </Button>
          </div>
          {recent[open].length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {recent[open].map((label) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => addLink(open, label)}
                  className="rounded-full bg-muted/30 px-2 py-0.5 text-[10.5px] text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function readLinks(metadata: any): EntityLink[] {
  const ls = metadata?.links;
  if (!Array.isArray(ls)) return [];
  return ls.filter((l): l is EntityLink => l && typeof l.label === "string" && ["person", "project", "place"].includes(l.kind));
}
