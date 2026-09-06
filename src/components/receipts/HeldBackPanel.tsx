// HeldBackPanel — the quiet half of the receipt.
//
// Receipts show what happened. This shows what deliberately didn't: the things
// Echo noticed and chose not to interrupt you with. Every line comes from a
// recorded evaluator decision — nothing here is reconstructed after the fact.
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { EmptyState, LoadingState } from "@/components/ui/state-views";
import { heldBackRead, type HeldBackRead } from "@/lib/heldBack";

export function HeldBackPanel() {
  const { applyScope, key } = useScope();
  const [read, setRead] = useState<HeldBackRead | null>(null);

  const load = useCallback(async () => {
    const { data } = await applyScope(
      supabase.from("audit_log").select("created_at, payload").eq("event", "awareness.evaluated"),
    )
      .order("created_at", { ascending: false })
      .limit(80);
    setRead(heldBackRead({ rows: (data ?? []) as any[] }));
  }, [applyScope]);

  useEffect(() => { void load(); }, [key, load]);

  return (
    <section className="vanta-card p-3">
      <div className="mb-2 flex items-start gap-2">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="text-[13px] font-medium">Held back</h3>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            {read ? read.sentence : "Reading the decisions Echo recorded."}
          </p>
        </div>
      </div>

      {read === null ? (
        <LoadingState label="Reading held-back decisions" />
      ) : read.empty ? (
        <EmptyState
          title="Nothing has been held back this week."
          hint="When Echo notices something and decides it isn't worth interrupting you, the reason lands here."
        />
      ) : (
        <ul className="space-y-1.5">
          {read.groups.map((g) => (
            <li key={g.reason} className="rounded-lg bg-muted/25 px-2.5 py-2 ring-1 ring-border/50">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium">{g.label}</span>
                <span className="shrink-0 text-[10.5px] text-muted-foreground">
                  {g.count} · last {formatDistanceToNow(new Date(g.lastAt), { addSuffix: true })}
                </span>
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{g.because}</p>
              {g.kinds.length > 0 && (
                <p className="mt-0.5 text-[10.5px] text-muted-foreground/80">{g.kinds.join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
