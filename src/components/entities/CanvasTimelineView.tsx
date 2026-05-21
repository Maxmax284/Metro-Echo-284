import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2, FileText, CheckSquare, Zap, Paperclip } from "lucide-react";
import { format } from "date-fns";

type Item = {
  id: string;
  kind: "commitment" | "action" | "note" | "file";
  title: string;
  created_at: string;
};

type Props = { seedEntityId: string | null; windowDays?: 7 | 30 | 90 };

const ICON: Record<Item["kind"], any> = {
  commitment: CheckSquare,
  action: Zap,
  note: FileText,
  file: Paperclip,
};

// Phase 6b — Timeline view. Pure read of recent operational objects ordered
// chronologically. Scoped by entity when a seed is provided (via entity_links).
export function CanvasTimelineView({ seedEntityId }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();

      let scopedIds: Record<string, Set<string>> | null = null;
      if (seedEntityId) {
        const { data: links } = await supabase
          .from("entity_links")
          .select("source_kind, source_id")
          .eq("user_id", user.id)
          .eq("entity_id", seedEntityId)
          .limit(500);
        scopedIds = { commitment: new Set(), action: new Set(), note: new Set(), file: new Set() };
        for (const l of (links ?? []) as any[]) {
          const bucket = scopedIds[l.source_kind as keyof typeof scopedIds];
          if (bucket) bucket.add(l.source_id);
        }
      }

      const inOrAll = async <T,>(
        kind: keyof typeof ICON,
        promise: any,
      ): Promise<Item[]> => {
        const { data } = await promise;
        return ((data ?? []) as any[]).map((r) => ({
          id: r.id,
          kind,
          title: r.summary ?? r.title ?? r.filename ?? "(untitled)",
          created_at: r.created_at,
        }));
      };

      const cIds = scopedIds?.commitment ? Array.from(scopedIds.commitment) : null;
      const aIds = scopedIds?.action ? Array.from(scopedIds.action) : null;
      const nIds = scopedIds?.note ? Array.from(scopedIds.note) : null;
      const fIds = scopedIds?.file ? Array.from(scopedIds.file) : null;

      const [cs, as, ns, fs] = await Promise.all([
        inOrAll("commitment",
          (cIds && cIds.length === 0)
            ? Promise.resolve({ data: [] })
            : (cIds
              ? supabase.from("commitments").select("id, summary, created_at").eq("user_id", user.id).in("id", cIds).order("created_at", { ascending: false }).limit(30)
              : supabase.from("commitments").select("id, summary, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20))),
        inOrAll("action",
          (aIds && aIds.length === 0)
            ? Promise.resolve({ data: [] })
            : (aIds
              ? supabase.from("actions").select("id, title, created_at").eq("user_id", user.id).in("id", aIds).order("created_at", { ascending: false }).limit(30)
              : supabase.from("actions").select("id, title, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20))),
        inOrAll("note",
          (nIds && nIds.length === 0)
            ? Promise.resolve({ data: [] })
            : (nIds
              ? supabase.from("notes").select("id, title, created_at").eq("user_id", user.id).in("id", nIds).order("created_at", { ascending: false }).limit(30)
              : supabase.from("notes").select("id, title, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20))),
        inOrAll("file",
          (fIds && fIds.length === 0)
            ? Promise.resolve({ data: [] })
            : (fIds
              ? supabase.from("ingested_files").select("id, filename, created_at").eq("user_id", user.id).in("id", fIds).order("created_at", { ascending: false }).limit(30)
              : supabase.from("ingested_files").select("id, filename, created_at").eq("user_id", user.id).gte("created_at", since).order("created_at", { ascending: false }).limit(20))),
      ]);

      const merged = [...cs, ...as, ...ns, ...fs]
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
        .slice(0, 60);

      if (!alive) return;
      setItems(merged);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, seedEntityId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-muted-foreground">
        Nothing in the last 30 days to show here.
      </div>
    );
  }

  // Group by day
  const groups = new Map<string, Item[]>();
  for (const it of items) {
    const key = format(new Date(it.created_at), "EEE, MMM d");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(it);
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-2 space-y-3">
      {Array.from(groups.entries()).map(([day, list]) => (
        <div key={day}>
          <div className="sticky top-0 z-10 bg-background/95 px-1 py-1 text-[10.5px] uppercase tracking-wider text-muted-foreground backdrop-blur">
            {day}
          </div>
          <ul className="mt-1 space-y-1.5">
            {list.map((it) => {
              const Icon = ICON[it.kind];
              return (
                <li
                  key={`${it.kind}-${it.id}`}
                  className="flex items-start gap-2 rounded-lg border border-border/60 bg-surface-elevated/40 p-2"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-foreground">{it.title}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {format(new Date(it.created_at), "h:mm a")} · {it.kind}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
