import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEntitySheet } from "./EntityContext";
import { useCanvas } from "./CanvasContext";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Hash, Link2, MapPin, Tag, Calendar, Box, User, FileText, CheckSquare, MessageSquare, Inbox, MapPinned, Loader2, Network, Check, X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { SherlockChipTrigger } from "@/components/sherlock/SherlockChipTrigger";
import { EmbeddedSherlockFindings } from "@/components/sherlock/EmbeddedSherlockFindings";
import { RelatedEntitiesSection } from "./RelatedEntitiesSection";
import { ConnectButton } from "@/components/links/ConnectButton";
import { LinkedChipsBar } from "@/components/links/LinkedChipsBar";

type EntityRow = {
  id: string;
  kind: string;
  display_name: string;
  aliases: string[];
  confidence: string;
  first_seen_at: string;
  last_seen_at: string;
  metadata: any;
  parent_entity_id?: string | null;
  slug?: string | null;
  summary?: string | null;
  pinned?: boolean | null;
};

type LinkRow = {
  id: string;
  source_kind: string;
  source_id: string;
  role: string;
  confidence: string | null;
  created_at: string;
  preview?: string | null;
};

const KIND_ICON = {
  person: User, place: MapPin, org: Box, topic: Hash, thing: Link2, event: Calendar,
} as const;

const SOURCE_ICON: Record<string, any> = {
  note: FileText, commitment: CheckSquare, message: MessageSquare, signal: MapPinned,
  field_note: MapPinned, ingested_file: Inbox, reminder: CheckSquare,
};

function pickKindIcon(kind: string, name: string) {
  if (name?.startsWith("@")) return AtSign;
  if (name?.startsWith("#")) return Hash;
  return (KIND_ICON as any)[kind] ?? Tag;
}

async function fetchPreview(kind: string, id: string): Promise<string | null> {
  try {
    if (kind === "note") {
      const { data } = await supabase.from("notes").select("title, body").eq("id", id).maybeSingle();
      return data ? (data.title || (data.body ?? "").slice(0, 80)) : null;
    }
    if (kind === "commitment" || kind === "reminder") {
      const { data } = await supabase.from("commitments").select("summary").eq("id", id).maybeSingle();
      return data?.summary ?? null;
    }
    if (kind === "message") {
      const { data } = await supabase.from("messages").select("content").eq("id", id).maybeSingle();
      return data?.content?.slice(0, 80) ?? null;
    }
    if (kind === "field_note" || kind === "signal") {
      const { data } = await supabase.from("field_notes").select("summary").eq("id", id).maybeSingle();
      return data?.summary ?? null;
    }
    if (kind === "ingested_file") {
      const { data } = await supabase.from("ingested_files").select("filename").eq("id", id).maybeSingle();
      return data?.filename ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

export function EntityDetailSheet() {
  const { openEntityId, openEntity, closeEntity } = useEntitySheet();
  const { openCanvas } = useCanvas();
  const [entity, setEntity] = useState<EntityRow | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [parent, setParent] = useState<{ id: string; display_name: string; kind: string } | null>(null);
  const [children, setChildren] = useState<Array<{ id: string; display_name: string; kind: string }>>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!openEntityId) { setEntity(null); setLinks([]); setParent(null); setChildren([]); setCounts({}); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const { data: ent } = await supabase
        .from("entities")
        .select("id, kind, display_name, aliases, confidence, first_seen_at, last_seen_at, metadata, parent_entity_id, slug, summary, pinned")
        .eq("id", openEntityId)
        .maybeSingle();
      if (!alive) return;
      setEntity(ent as EntityRow | null);

      const { data: raw } = await supabase
        .from("entity_links")
        .select("id, source_kind, source_id, role, confidence, created_at")
        .eq("entity_id", openEntityId)
        .order("created_at", { ascending: false })
        .limit(40);
      const linkRows = (raw ?? []) as LinkRow[];
      const enriched = await Promise.all(linkRows.map(async (l) => ({
        ...l,
        preview: await fetchPreview(l.source_kind, l.source_id),
      })));
      if (alive) { setLinks(enriched); }

      // Project hierarchy + counts (only meaningful for project kind, but cheap).
      if (ent) {
        const e = ent as EntityRow;
        const tasks: Promise<any>[] = [];
        if (e.parent_entity_id) {
          tasks.push((async () => {
            const { data } = await supabase.from("entities").select("id, display_name, kind").eq("id", e.parent_entity_id!).maybeSingle();
            if (alive && data) setParent(data as any);
          })());
        }
        tasks.push((async () => {
          const { data } = await supabase.from("entities").select("id, display_name, kind").eq("parent_entity_id", e.id).order("display_name").limit(20);
          if (alive) setChildren((data ?? []) as any);
        })());
        // Counts derived from entity_links roles.
        tasks.push((async () => {
          const tally: Record<string, number> = {};
          for (const l of linkRows) tally[l.source_kind] = (tally[l.source_kind] ?? 0) + 1;
          if (alive) setCounts(tally);
        })());
        await Promise.all(tasks);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [openEntityId]);

  async function acceptLink(id: string) {
    await supabase.from("entity_links").update({ confidence: "medium" }).eq("id", id);
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, confidence: "medium" } : l)));
  }
  async function dismissLink(id: string) {
    await supabase.from("entity_links").delete().eq("id", id);
    setLinks((ls) => ls.filter((l) => l.id !== id));
  }

  const Icon = entity ? pickKindIcon(entity.kind, entity.display_name) : Tag;

  return (
    <Sheet open={!!openEntityId} onOpenChange={(o) => { if (!o) closeEntity(); }}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/15 p-1.5 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <SheetTitle className="truncate text-left">
              {entity?.display_name ?? "Entity"}
            </SheetTitle>
          </div>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-[11px]">
            {entity?.kind && <span className="rounded-full bg-surface-elevated/60 px-2 py-0.5">{entity.kind}</span>}
            {entity?.confidence && <span className="rounded-full bg-surface-elevated/60 px-2 py-0.5">confidence: {entity.confidence}</span>}
            {entity?.last_seen_at && <span className="text-muted-foreground/80">last seen {formatDistanceToNow(new Date(entity.last_seen_at), { addSuffix: true })}</span>}
            {entity && (
              <SherlockChipTrigger
                operation="relate"
                entityType="freeform"
                entityId={entity.id}
                text={entity.display_name}
                title={entity.display_name}
              />
            )}
          </SheetDescription>
          {entity && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 gap-1.5 text-[11px]"
              onClick={() => { const id = entity.id; closeEntity(); openCanvas(id); }}
            >
              <Network className="h-3 w-3" /> Open in Canvas
            </Button>
          )}
          {entity && <EmbeddedSherlockFindings sourceType="entity" sourceId={entity.id} className="mt-1" />}
        </SheetHeader>

        {entity?.kind === "project" && (
          <div className="mt-4 space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10.5px] uppercase tracking-wider text-primary/80">Project</p>
              {entity.slug && (
                <code className="rounded bg-surface-elevated/50 px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                  {entity.slug}
                </code>
              )}
            </div>
            {parent && (
              <button
                type="button"
                onClick={() => openEntity(parent.id)}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                title={`Open parent · ${parent.kind}`}
              >
                ↳ part of <span className="underline-offset-2 hover:underline">{parent.display_name}</span>
              </button>
            )}
            {entity.summary && (
              <p className="text-[12px] leading-snug text-foreground/85">{entity.summary}</p>
            )}
            {Object.keys(counts).length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[
                  ["note", "notes"],
                  ["commitment", "commitments"],
                  ["message", "messages"],
                  ["ingested_file", "files"],
                  ["action", "actions"],
                  ["reminder", "reminders"],
                ].map(([k, label]) => {
                  const n = counts[k] ?? 0;
                  if (!n) return null;
                  return (
                    <span key={k} className="rounded-full bg-surface-elevated/60 px-2 py-0.5 text-[10.5px] text-muted-foreground">
                      {n} {label}
                    </span>
                  );
                })}
              </div>
            )}
            {children.length > 0 && (
              <div className="pt-1">
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Sub-topics</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {children.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => openEntity(c.id)}
                      className="rounded-full border border-border/60 bg-surface-elevated/40 px-2 py-0.5 text-[11px] text-foreground/85 hover:border-primary/40 hover:text-primary"
                    >
                      {c.display_name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}




        {entity?.aliases && entity.aliases.length > 0 && (
          <div className="mt-4">
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Aliases</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {entity.aliases.map((a) => (
                <span key={a} className="rounded-full border border-border/60 bg-surface-elevated/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}

        {entity && <RelatedEntitiesSection entityId={entity.id} />}
        {entity && (
          <div className="mt-4 space-y-1.5 rounded-lg border border-border/60 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Manual connections</p>
              <ConnectButton source={{ kind: "entity", id: entity.id, label: entity.display_name }} />
            </div>
            <LinkedChipsBar source={{ kind: "entity", id: entity.id }} />
          </div>
        )}

        {(() => {
          const ambiguous = links.filter((l) => (l.confidence ?? "low") === "low");
          const confirmed = links.filter((l) => (l.confidence ?? "low") !== "low");
          const renderRow = (l: LinkRow, isAmbiguous: boolean) => {
            const SIcon = SOURCE_ICON[l.source_kind] ?? Tag;
            return (
              <li
                key={l.id}
                className={cn(
                  "flex items-start gap-2 rounded-md border p-2 text-[12px]",
                  isAmbiguous
                    ? "border-dashed border-warn/40 bg-warn/5"
                    : "border-border/60 bg-surface-elevated/30",
                )}
              >
                <SIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{l.preview ?? `${l.source_kind} ${l.source_id.slice(0, 8)}`}</p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {l.source_kind} · {l.role} · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                  </p>
                </div>
                {isAmbiguous && (
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Confirm this connection" onClick={() => acceptLink(l.id)}>
                      <Check className="h-3 w-3 text-primary" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="Not related — dismiss" onClick={() => dismissLink(l.id)}>
                      <X className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                )}
              </li>
            );
          };
          return (
            <>
              {ambiguous.length > 0 && (
                <div className="mt-5">
                  <div className="flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3 text-warn" />
                    <p className="text-[10.5px] uppercase tracking-wider text-warn">Needs review</p>
                    <span className="ml-auto text-[10.5px] text-muted-foreground">{ambiguous.length}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Auto-linked but low confidence. Confirm to keep, dismiss if it's noise.</p>
                  {loading ? (
                    <div className="py-4 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
                  ) : (
                    <ul className="mt-2 space-y-1.5">{ambiguous.map((l) => renderRow(l, true))}</ul>
                  )}
                </div>
              )}
              <div className="mt-5">
                <div className="flex items-center justify-between">
                  <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Where this shows up</p>
                  <span className="text-[10.5px] text-muted-foreground">{confirmed.length}</span>
                </div>
                {loading ? (
                  <div className="py-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
                ) : confirmed.length === 0 ? (
                  <p className="mt-2 text-[12px] text-muted-foreground">{ambiguous.length > 0 ? "No confirmed sources yet." : "No sources yet."}</p>
                ) : (
                  <ul className="mt-2 space-y-1.5">{confirmed.map((l) => renderRow(l, false))}</ul>
                )}
              </div>
            </>
          );
        })()}
      </SheetContent>
    </Sheet>
  );
}
