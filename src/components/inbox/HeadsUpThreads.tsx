// HeadsUpThreads — every heads-up you answered, kept as a conversation.
//
// Reads the same threads as Ask (context_kind "nudge"); this is a door, not a
// second store. Opening one continues it in Ask, where it always lived.
import { useEffect, useMemo, useState } from "react";
import { Eye, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { useCompanion } from "@/components/companion/CompanionContext";
import { EmptyView, LoadingView } from "@/components/ui/state-views";
import { MOTION_PRESS } from "@/lib/motion";
import { cn } from "@/lib/utils";

export function HeadsUpThreads() {
  const { threads, loading, openThread } = useAskThreads();
  const { open, expand } = useCompanion();
  const [last, setLast] = useState<Record<string, string>>({});

  const heads = useMemo(() => threads.filter((t) => t.context_kind === "nudge"), [threads]);

  useEffect(() => {
    if (!heads.length) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("messages")
        .select("conversation_id, content, created_at, role")
        .in("conversation_id", heads.map((t) => t.id))
        .order("created_at", { ascending: false })
        .limit(200);
      if (cancelled || !data) return;
      const map: Record<string, string> = {};
      for (const m of data as { conversation_id: string; content: string }[]) {
        if (!map[m.conversation_id]) map[m.conversation_id] = m.content;
      }
      setLast(map);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heads.map((t) => t.id).join(",")]);

  if (loading) return <LoadingView label="Reading your heads-ups" />;
  if (!heads.length) {
    return (
      <EmptyView
        icon={Eye}
        title="No heads-up conversations yet"
        description="When Echo raises something on Today, reply to it right on the card. The whole back-and-forth lands here."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {heads.map((t) => (
        <li key={t.id} className="vanta-card p-3">
          <div className="flex items-start gap-2">
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {t.context_label ?? t.title ?? "Heads-up"}
              </p>
              {last[t.id] && (
                <p className="mt-0.5 line-clamp-2 text-[12px] text-muted-foreground">{last[t.id]}</p>
              )}
            </div>
            <button
              type="button"
              className={cn("inline-flex shrink-0 items-center gap-0.5 rounded-[3px] px-2 py-1 text-[11.5px] text-primary", MOTION_PRESS)}
              onClick={() => { openThread(t.id); open(); expand(); }}
            >
              Continue <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
