// HeldBackPanel — the quiet half of the receipt.
//
// Receipts show what happened. This shows what deliberately didn't: the things
// Echo noticed and chose not to interrupt you with. Every line comes from a
// recorded evaluator decision — nothing here is reconstructed after the fact.
import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { EyeOff, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { Button } from "@/components/ui/button";
import { EmptyState, LoadingState } from "@/components/ui/state-views";
import { vantaToast } from "@/lib/vantaVoice";
import { heldBackRead, type HeldBackRead } from "@/lib/heldBack";

export function HeldBackPanel() {
  const { applyScope, key } = useScope();
  const [read, setRead] = useState<HeldBackRead | null>(null);
  const [checking, setChecking] = useState(false);

  const load = useCallback(async () => {
    const { data } = await applyScope(
      supabase.from("audit_log").select("created_at, payload").eq("event", "awareness.evaluated"),
    )
      .order("created_at", { ascending: false })
      .limit(80);
    setRead(heldBackRead({ rows: (data ?? []) as any[] }));
  }, [applyScope]);

  useEffect(() => { void load(); }, [key, load]);

  /* A look-now tap, so the decision record isn't only whatever the last
     scheduled pass happened to leave behind. It sweeps you and no one else. */
  const checkNow = useCallback(async () => {
    setChecking(true);
    const { data, error } = await supabase.functions.invoke("awareness-drift-sweep", { body: {} });
    setChecking(false);
    if (error) {
      vantaToast.plain("Couldn't run that check just now", "Nothing changed. Try again in a moment.");
      return;
    }
    await load();
    const quiet = (data as any)?.quiet > 0;
    if (quiet) vantaToast.plain("Inside your quiet hours", "Echo looked but wrote nothing.");
  }, [load]);

  return (
    <section className="vanta-card p-3">
      <div className="mb-2 flex items-start gap-2">
        <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-medium">Held back</h3>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
            {read ? read.sentence : "Reading the decisions Echo recorded."}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-9 shrink-0 gap-1.5 text-[11.5px]"
          onClick={checkNow}
          disabled={checking}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
          {checking ? "Looking" : "Look now"}
        </Button>
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
