import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Loader2, ExternalLink, Sparkles } from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";

type ResearchObj = {
  id: string;
  question: string;
  summary: string | null;
  status: string;
  related_entity_id: string | null;
  created_at: string;
};
type Source = {
  id: string;
  research_id: string;
  title: string | null;
  url: string | null;
  provider: string | null;
  snippet: string | null;
};

// Phase 6 — Research "source cards" surface inside Command Canvas.
// Read-only. Shows recent Research Briefs scoped to the canvas seed (or recent overall)
// with their top sources, so outside context appears visually next to internal entities.
export function CanvasResearchCards({ seedEntityId }: { seedEntityId: string | null }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ResearchObj[]>([]);
  const [sources, setSources] = useState<Map<string, Source[]>>(new Map());

  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("research_objects")
        .select("id, question, summary, status, related_entity_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(seedEntityId ? 8 : 4);
      if (seedEntityId) q = q.eq("related_entity_id", seedEntityId);
      const { data } = await q;
      const list = (data ?? []) as ResearchObj[];
      let srcMap = new Map<string, Source[]>();
      if (list.length > 0) {
        const { data: srcs } = await supabase
          .from("research_sources")
          .select("id, research_id, title, url, provider, snippet")
          .in("research_id", list.map((r) => r.id))
          .order("position", { ascending: true });
        for (const s of (srcs ?? []) as Source[]) {
          const arr = srcMap.get(s.research_id) ?? [];
          arr.push(s);
          srcMap.set(s.research_id, arr);
        }
      }
      if (!alive) return;
      setItems(list);
      setSources(srcMap);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [user, seedEntityId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Looking outside…
      </div>
    );
  }
  if (items.length === 0) return null;

  return (
    <div className="px-3 pt-2 pb-1 space-y-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Outside context
      </div>
      {items.map((r) => {
        const srcs = (sources.get(r.id) ?? []).slice(0, 3);
        return (
          <div
            key={r.id}
            className="rounded-xl border border-primary/20 bg-primary/[0.04] p-3 text-left"
          >
            <div className="text-[12px] font-medium text-foreground line-clamp-2">{r.question}</div>
            {r.summary && (
              <div className="mt-1 text-[11px] text-muted-foreground line-clamp-3">{r.summary}</div>
            )}
            <div className="mt-1.5 text-[10px] text-muted-foreground">
              {formatDistanceToNowStrict(new Date(r.created_at), { addSuffix: true })}
              {r.status !== "completed" && <> · {r.status}</>}
            </div>
            {srcs.length > 0 && (
              <ul className="mt-2 space-y-1">
                {srcs.map((s) => (
                  <li key={s.id} className="text-[11px]">
                    {s.url ? (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-start gap-1 text-primary hover:underline"
                      >
                        <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                        <span className="line-clamp-1">{s.title || s.url}</span>
                      </a>
                    ) : (
                      <span className="text-muted-foreground line-clamp-1">{s.title || "Source"}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
