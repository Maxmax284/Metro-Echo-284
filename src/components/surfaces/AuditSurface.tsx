import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type AuditRow = {
  id: string;
  event: string;
  entity_type: string;
  entity_id: string | null;
  payload: any;
  created_at: string;
};

type ActionEvent = {
  id: string;
  action_id: string;
  from_status: string | null;
  to_status: string;
  actor: string;
  reason: string | null;
  created_at: string;
};

export function AuditSurface() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [a, e] = await Promise.all([
      supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("action_events").select("*").order("created_at", { ascending: false }).limit(60),
    ]);
    setAudit((a.data ?? []) as AuditRow[]);
    setEvents((e.data ?? []) as ActionEvent[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const f = filter.trim().toLowerCase();
  const auditFiltered = f
    ? audit.filter((r) =>
        r.event.toLowerCase().includes(f) ||
        r.entity_type.toLowerCase().includes(f) ||
        (r.entity_id ?? "").toLowerCase().includes(f) ||
        JSON.stringify(r.payload ?? {}).toLowerCase().includes(f))
    : audit;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 md:px-4">
        <ScrollText className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-medium">Audit</h2>
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          className="ml-2 h-7 max-w-[200px] text-xs"
        />
        <Button variant="ghost" size="icon" className="ml-auto h-7 w-7" onClick={load} aria-label="Refresh">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3 md:p-4">
        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Action lifecycle</h3>
          <div className="space-y-1">
            {events.length === 0 && <p className="text-xs text-muted-foreground">No action events.</p>}
            {events.map((ev) => (
              <Card key={ev.id} className="flex items-start gap-2 p-2 text-xs">
                <Badge variant="outline" className="shrink-0 text-[9px]">{ev.actor}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate">
                    <span className="text-muted-foreground">{ev.from_status ?? "—"}</span>
                    <span className="mx-1">→</span>
                    <span className="font-medium">{ev.to_status}</span>
                  </div>
                  {ev.reason && <div className="line-clamp-2 text-[11px] text-muted-foreground">{ev.reason}</div>}
                  <div className="text-[10px] text-muted-foreground/70">
                    action {ev.action_id.slice(0, 8)} · {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Audit log</h3>
          <div className="space-y-1">
            {auditFiltered.length === 0 && <p className="text-xs text-muted-foreground">Nothing matches.</p>}
            {auditFiltered.map((r) => (
              <Card key={r.id} className="p-2 text-xs">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="shrink-0 text-[9px]">{r.entity_type}</Badge>
                  <span className="font-medium">{r.event}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                  </span>
                </div>
                {r.payload && Object.keys(r.payload).length > 0 && (
                  <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-1.5 text-[10px] text-muted-foreground">
                    {JSON.stringify(r.payload, null, 2)}
                  </pre>
                )}
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
