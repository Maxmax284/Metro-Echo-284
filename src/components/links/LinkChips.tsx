import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Plus, User, Briefcase, MapPin, X, Paperclip } from "lucide-react";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";
import { useScope } from "@/hooks/useScope";

export type LinkKind = "person" | "project" | "place";
export type EntityLink = { kind: LinkKind; label: string; ref?: string | null };

type EntityKind = "note" | "commitment" | "ingested_file" | "message";

const KIND_ICON = { person: User, project: Briefcase, place: MapPin } as const;
const KIND_LABEL = { person: "Person", project: "Project", place: "Place" } as const;
const KIND_PLACEHOLDER = {
  person: "Who is this about? (e.g. Nikki)",
  project: "Which project? (e.g. Lamai Muay Thai)",
  place: "Where? (e.g. Phuket office)",
} as const;

/**
 * Lightweight relationship chips stored in `metadata.links: EntityLink[]`.
 * No new tables — pure metadata. Recent-label suggestions are sourced from
 * the user's own existing links across notes/commitments/files.
 *
 * Trigger surface: one "Attach" button opens a sheet that handles person,
 * project, and place in one calm pane (was three +chip buttons before).
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
  const { applyScope, withScope, key: scopeKey } = useScope();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<LinkKind>("project");
  const [value, setValue] = useState("");
  const [recent, setRecent] = useState<Record<LinkKind, string[]>>({ person: [], project: [], place: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user || !sheetOpen) return;
    (async () => {
      const [n, c, f, m] = await Promise.all([
        applyScope(supabase.from("notes").select("metadata").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(120)),
        applyScope(supabase.from("commitments").select("metadata").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(120)),
        applyScope(supabase.from("ingested_files").select("metadata").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(80)),
        applyScope(supabase.from("messages").select("metadata").eq("user_id", user.id).eq("role", "user").order("created_at", { ascending: false }).limit(80)),
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
  }, [user, sheetOpen, scopeKey]);

  const audit = async (event: string, link: EntityLink) => {
    if (!user) return;
    await supabase.from("audit_log").insert(withScope({
      user_id: user.id,
      entity_type: entityKind,
      entity_id: entityId,
      event,
      payload: { link },
    }));
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
      setValue("");
      return;
    }
    const next = [...links, { kind, label: clean }];
    await persist(next);
    await audit("link.added", { kind, label: clean });
    toast.success({ title: `Linked to ${clean}.` });
    setValue("");
    setSheetOpen(false);
  };

  const removeLink = async (link: EntityLink) => {
    const next = links.filter((l) => !(l.kind === link.kind && l.label === link.label));
    await persist(next);
    await audit("link.removed", link);
  };

  const hasLinks = links.length > 0;
  const ActiveIcon = KIND_ICON[tab];

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
          <span className="text-[11px] italic text-muted-foreground">
            Not connected yet. Attach this so Vanta knows where it belongs.
          </span>
        )}

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-surface-elevated/60 px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label="Attach to person, project, or place"
            >
              {hasLinks ? <Plus className="h-2.5 w-2.5" /> : <Paperclip className="h-2.5 w-2.5" />}
              Attach
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80vh]">
            <SheetHeader className="text-left">
              <SheetTitle className="text-sm font-medium">
                Attach this to where it belongs
              </SheetTitle>
            </SheetHeader>
            <div className="mt-3 space-y-3" onClick={(e) => e.stopPropagation()}>
              {/* Kind tabs */}
              <div
                role="tablist"
                aria-label="Attach kind"
                className="flex items-center gap-1 rounded-xl border border-border/60 bg-surface-elevated/60 p-1"
              >
                {(["project", "person", "place"] as LinkKind[]).map((k) => {
                  const Icon = KIND_ICON[k];
                  const active = tab === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => { setTab(k); setValue(""); }}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] transition-colors min-h-[40px]",
                        active
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {KIND_LABEL[k]}
                    </button>
                  );
                })}
              </div>

              {/* Input */}
              <div className="flex gap-1.5">
                <Input
                  autoFocus
                  placeholder={KIND_PLACEHOLDER[tab]}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addLink(tab, value); }}
                  className="h-9 text-[12.5px]"
                />
                <Button
                  size="sm"
                  className="h-9 gap-1 px-3 text-[12px]"
                  disabled={busy || !value.trim()}
                  onClick={() => addLink(tab, value)}
                >
                  <ActiveIcon className="h-3 w-3" />
                  Attach
                </Button>
              </div>

              {/* Recent suggestions */}
              {recent[tab].length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    Recent {KIND_LABEL[tab].toLowerCase()}s
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent[tab].map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => addLink(tab, label)}
                        className="rounded-full bg-muted/40 px-2.5 py-1 text-[11.5px] text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[10.5px] text-muted-foreground">
                Nothing runs — this just tells Vanta where it belongs.
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

export function readLinks(metadata: any): EntityLink[] {
  const ls = metadata?.links;
  if (!Array.isArray(ls)) return [];
  return ls.filter((l): l is EntityLink => l && typeof l.label === "string" && ["person", "project", "place"].includes(l.kind));
}

