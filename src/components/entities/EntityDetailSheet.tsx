import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useEntitySheet } from "./EntityContext";
import { useCanvas } from "./CanvasContext";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Hash, Link2, MapPin, Tag, Calendar, Box, User, FileText, CheckSquare, MessageSquare, Inbox, MapPinned, Loader2, Network } from "lucide-react";
import { cn } from "@/lib/utils";

type EntityRow = {
  id: string;
  kind: string;
  display_name: string;
  aliases: string[];
  confidence: string;
  first_seen_at: string;
  last_seen_at: string;
  metadata: any;
};

type LinkRow = {
  id: string;
  source_kind: string;
  source_id: string;
  role: string;
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
  const { openEntityId, closeEntity } = useEntitySheet();
  const { openCanvas } = useCanvas();
  const [entity, setEntity] = useState<EntityRow | null>(null);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!openEntityId) { setEntity(null); setLinks([]); return; }
    let alive = true;
    setLoading(true);
    (async () => {
      const { data: ent } = await supabase
        .from("entities")
        .select("id, kind, display_name, aliases, confidence, first_seen_at, last_seen_at, metadata")
        .eq("id", openEntityId)
        .maybeSingle();
      if (!alive) return;
      setEntity(ent as EntityRow | null);

      const { data: raw } = await supabase
        .from("entity_links")
        .select("id, source_kind, source_id, role, created_at")
        .eq("entity_id", openEntityId)
        .order("created_at", { ascending: false })
        .limit(40);
      const linkRows = (raw ?? []) as LinkRow[];
      const enriched = await Promise.all(linkRows.map(async (l) => ({
        ...l,
        preview: await fetchPreview(l.source_kind, l.source_id),
      })));
      if (alive) { setLinks(enriched); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [openEntityId]);

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
        </SheetHeader>

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

        <div className="mt-5">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">Where this shows up</p>
            <span className="text-[10.5px] text-muted-foreground">{links.length}</span>
          </div>
          {loading ? (
            <div className="py-6 text-center text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></div>
          ) : links.length === 0 ? (
            <p className="mt-2 text-[12px] text-muted-foreground">No sources yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {links.map((l) => {
                const SIcon = SOURCE_ICON[l.source_kind] ?? Tag;
                return (
                  <li
                    key={l.id}
                    className={cn(
                      "flex items-start gap-2 rounded-md border border-border/60 bg-surface-elevated/30 p-2 text-[12px]",
                    )}
                  >
                    <SIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-foreground">{l.preview ?? `${l.source_kind} ${l.source_id.slice(0, 8)}`}</p>
                      <p className="text-[10.5px] text-muted-foreground">
                        {l.source_kind} · {l.role} · {formatDistanceToNow(new Date(l.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
