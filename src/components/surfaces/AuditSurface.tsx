import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, RefreshCw, Search } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { StatusDot, type DotTone } from "@/components/ui/status-dot";

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

const QUICK_FILTERS = [
  { id: "",              label: "All" },
  { id: "capture",       label: "Captures" },
  { id: "telegram",      label: "Telegram" },
  { id: "action",        label: "Actions" },
  { id: "commitment",    label: "Commitments" },
  { id: "note",          label: "Notes" },
  { id: "ingested_file", label: "Files" },
  { id: "schedule",      label: "Schedule" },
  { id: "timezone",      label: "Timezone" },
  { id: "reminder",      label: "Reminders" },
];

const EVENT_CLASSES: { id: string; label: string; match: (e: string) => boolean }[] = [
  { id: "",         label: "Any event",  match: () => true },
  { id: "routed",   label: "Routed",     match: (e) => e.includes("routed") },
  { id: "created",  label: "Created",    match: (e) => /(created|added|insert)/.test(e) },
  { id: "changed",  label: "Changed",    match: (e) => /(updated|change|approve|transition|snoozed|completed|dropped)/.test(e) },
  { id: "query",    label: "Queries",    match: (e) => e.includes("query") },
  { id: "failed",   label: "Failed",     match: (e) => /(fail|error|reject|retried)/.test(e) },
];

function statusTone(status: string): DotTone {
  const s = status.toLowerCase();
  if (["approved", "done", "completed", "executed", "linked"].includes(s)) return "primary";
  if (["pending", "draft", "proposed", "queued", "in_progress", "processing"].includes(s)) return "accent";
  if (["rejected", "blocked", "failed", "cancelled", "error"].includes(s)) return "destructive";
  return "muted";
}

function eventTone(event: string): DotTone {
  const e = event.toLowerCase();
  if (e.includes("create") || e.includes("insert") || e.includes("add")) return "primary";
  if (e.includes("update") || e.includes("change") || e.includes("approve")) return "accent";
  if (e.includes("delete") || e.includes("remove") || e.includes("reject") || e.includes("fail")) return "destructive";
  return "muted";
}

export function AuditSurface() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [quick, setQuick] = useState("");
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

  const auditFiltered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let rows = audit;
    if (quick) rows = rows.filter((r) => r.entity_type.toLowerCase().includes(quick));
    if (f) {
      rows = rows.filter((r) =>
        r.event.toLowerCase().includes(f) ||
        r.entity_type.toLowerCase().includes(f) ||
        (r.entity_id ?? "").toLowerCase().includes(f) ||
        JSON.stringify(r.payload ?? {}).toLowerCase().includes(f));
    }
    return rows;
  }, [audit, filter, quick]);

  const newestAge = audit[0] ? formatDistanceToNow(new Date(audit[0].created_at), { addSuffix: true }) : null;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Two-row header */}
      <div className="space-y-2 border-b border-border/40 px-3 py-2.5 md:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Audit</h2>
            <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
              receipts only
            </span>
          </div>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} aria-label="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
            <StatusDot tone="primary" /> {audit.length} event{audit.length === 1 ? "" : "s"}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/20 px-2 py-0.5 ring-1 ring-border/50">
            <StatusDot tone="accent" /> {events.length} transition{events.length === 1 ? "" : "s"}
          </span>
          {newestAge && <span className="text-muted-foreground/80">last entry {newestAge}</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter event, entity, payload…"
              className="h-7 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.id || "all"}
              onClick={() => setQuick(qf.id)}
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] ring-1 transition-colors",
                quick === qf.id
                  ? "bg-primary/15 text-primary ring-primary/40"
                  : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
              )}
            >
              {qf.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3 md:p-4">
        <section>
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">Action lifecycle</h3>
          <div className="space-y-1">
            {events.length === 0 && (
              <p className="rounded-md border border-dashed border-border/50 py-4 text-center text-[11px] text-muted-foreground">
                No action events yet. Approvals and status changes will appear here.
              </p>
            )}
            {events.map((ev) => (
              <Card key={ev.id} className="flex items-start gap-2 p-2 text-xs">
                <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-wider">{ev.actor}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 truncate">
                    <span className="text-muted-foreground">{ev.from_status ?? "—"}</span>
                    <span aria-hidden>→</span>
                    <StatusDot tone={statusTone(ev.to_status)} title={ev.to_status} />
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
          <h3 className="mb-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            Audit log {quick && <span className="text-muted-foreground/60">· filtered: {quick}</span>}
          </h3>
          <div className="space-y-1">
            {auditFiltered.length === 0 && (
              <p className="rounded-md border border-dashed border-border/50 py-4 text-center text-[11px] text-muted-foreground">
                Nothing matches. Clear filters above.
              </p>
            )}
            {auditFiltered.map((r) => (
              <Card key={r.id} className="p-2 text-xs">
                <div className="flex items-center gap-2">
                  <StatusDot tone={eventTone(r.event)} title={r.event} />
                  <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-wider">{r.entity_type}</Badge>
                  <span className="truncate font-medium">{r.event}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
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
