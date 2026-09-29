import { useEffect, useMemo, useRef, useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { supabase } from "@/integrations/supabase/client";
import { useScope } from "@/hooks/useScope";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollText, RefreshCw, Search, X } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { cn } from "@/lib/utils";
import { StatusDot, type DotTone } from "@/components/ui/status-dot";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { humanizeEvent, kindLabel, trustNote } from "@/lib/plainLabels";
import { AuditDetailDrawer } from "@/components/audit/AuditDetailDrawer";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { MOTION_BOOT, MOTION_FOCUS, MOTION_ROW, MOTION_STAMP, MOTION_TIME_LOCK } from "@/lib/motion";
import { SectionNote } from "@/components/ui/section-note";
import { HeldBackPanel } from "@/components/receipts/HeldBackPanel";
import { ExplainThisButton } from "@/components/ask/ExplainThisButton";
import { sectionNote } from "@/lib/roomCopy";
import { ReceiptUnfold, receiptFacts } from "@/components/audit/ReceiptUnfold";
import { MachineText, SectionRail } from "@/components/ui/instrument";
import { ReceiptsFront } from "@/components/receipts/ReceiptsFront";
import { ReceiptsLedger } from "@/components/receipts/ReceiptsLedger";
import { JourneySummary } from "@/components/receipts/JourneySummary";
import { StationStamps } from "@/components/receipts/StationStamps";
import { isQuietRecord, receiptDigest, type ReceiptLine } from "@/lib/receiptDigest";

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

export function AuditSurface({ focusActionId }: { focusActionId?: string | null } = {}) {
  const { timezone } = useUserTimezone();
  const { applyScope, key: scopeKey, matches } = useScope();
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [events, setEvents] = useState<ActionEvent[]>([]);
  const [filter, setFilter] = useState("");
  const [quick, setQuick] = useState("");
  const [eventClass, setEventClass] = useState("");
  const [loading, setLoading] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [drawerRow, setDrawerRow] = useState<AuditRow | null>(null);
  /* Unfold in place: the receipt opens where it sits. One at a time, because
     evidence is read one item at a time. */
  const [openId, setOpenId] = useState<string | null>(null);
  /* The room opens with six human lines. The raw record is one tap deeper. */
  const [showRecord, setShowRecord] = useState(false);

  // Deep-link from an action card's "See in Receipts": narrow to that action.
  useEffect(() => {
    if (!focusActionId) return;
    setQuick("action");
    setFilter(focusActionId);
  }, [focusActionId]);

  const load = async () => {
    setLoading(true);
    const [a, e] = await Promise.all([
      applyScope(supabase.from("audit_log").select("*")).order("created_at", { ascending: false }).limit(100),
      supabase.from("action_events").select("*").order("created_at", { ascending: false }).limit(60),
    ]);
    setAudit((a.data ?? []) as AuditRow[]);
    setEvents((e.data ?? []) as ActionEvent[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [scopeKey]);

  // Wave 5 — live receipts. Every state change emits an audit_log row;
  // surface them as they happen so the Audit lane reflects reality, not a
  // snapshot. Debounce to coalesce bursts.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const nudge = () => { if (t) clearTimeout(t); t = setTimeout(() => load(), 400); };
    // Scope guard: postgres_changes can't express "IS NULL", so rows from other
    // rooms are dropped here before they can trigger a reload.
    const scoped = (payload: any) => { if (matches(payload?.new)) nudge(); };
    const channel = supabase
      .channel(`audit-live-${scopeKey}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "audit_log" }, scoped)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "action_events" }, nudge)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel); };
  }, [scopeKey, matches]);

  const auditFiltered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    let rows = audit;
    if (quick) rows = rows.filter((r) => r.entity_type.toLowerCase().includes(quick));
    if (eventClass) {
      const cls = EVENT_CLASSES.find((c) => c.id === eventClass);
      if (cls) rows = rows.filter((r) => cls.match(r.event.toLowerCase()));
    }
    if (f) {
      rows = rows.filter((r) =>
        r.event.toLowerCase().includes(f) ||
        r.entity_type.toLowerCase().includes(f) ||
        (r.entity_id ?? "").toLowerCase().includes(f) ||
        JSON.stringify(r.payload ?? {}).toLowerCase().includes(f));
    }
    return rows;
  }, [audit, filter, quick, eventClass]);

  // Reset pagination whenever filters change.
  useEffect(() => { setVisibleCount(30); }, [filter, quick, eventClass]);

  /* Receipts is the stable room — the only motion here is a genuinely new
     receipt arriving. Anything already seen never animates again. */
  const seenIds = useRef<Set<string> | null>(null);
  const isNewReceipt = (id: string) => (seenIds.current ? !seenIds.current.has(id) : false);
  useEffect(() => {
    const next = seenIds.current ?? new Set<string>();
    for (const r of audit) next.add(r.id);
    seenIds.current = next;
  }, [audit]);


  const newestAge = audit[0] ? formatDistanceToNow(new Date(audit[0].created_at), { addSuffix: true }) : null;
  const activeFilters = (quick ? 1 : 0) + (eventClass ? 1 : 0) + (filter.trim() ? 1 : 0);
  const clearAll = () => { setQuick(""); setEventClass(""); setFilter(""); };

  const digest = useMemo(() => receiptDigest(audit, events), [audit, events]);
  const quiet = isQuietRecord(digest);

  /* Deep-linked from an action card: the record is already the point. */
  useEffect(() => { if (focusActionId) setShowRecord(true); }, [focusActionId]);

  const drill = (line: ReceiptLine) => {
    setFilter("");
    setEventClass(line.key === "failed" ? "failed" : "");
    setQuick(line.drill ?? "");
    setShowRecord(true);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="space-y-2 border-b border-border/40 px-3 py-2.5 md:px-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-medium">Receipts</h2>
          </div>
          <div className="flex items-center gap-1">
            <ExplainThisButton room="receipts" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={load} aria-label="Refresh">
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>
        {newestAge && <p className="text-[10.5px] text-muted-foreground">Last change {newestAge}</p>}
        {showRecord && (
        <>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by what happened, who, or details…"
              className="h-7 pl-7 text-xs"
            />
          </div>
          {activeFilters > 0 && (
            <button
              onClick={clearAll}
              className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/30 px-2 py-1 text-[10.5px] text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
              aria-label="Clear filters"
            >
              <X className="h-3 w-3" /> Clear {activeFilters}
            </button>
          )}
        </div>
        <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1 pb-0.5">
          {QUICK_FILTERS.map((qf) => (
            <button
              key={qf.id || "all"}
              onClick={() => setQuick(qf.id)}
              className={cn(
                "shrink-0 snap-start rounded-full px-2 py-0.5 text-[10.5px] ring-1 transition-colors",
                quick === qf.id
                  ? "bg-primary/15 text-primary ring-primary/40"
                  : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
              )}
            >
              {qf.label}
            </button>
          ))}
        </div>
        <div className="-mx-1 flex snap-x snap-mandatory gap-1.5 overflow-x-auto px-1">
          {EVENT_CLASSES.map((ec) => (
            <button
              key={ec.id || "any"}
              onClick={() => setEventClass(ec.id)}
              className={cn(
                "shrink-0 snap-start rounded-full px-2 py-0.5 text-[10.5px] ring-1 transition-colors",
                eventClass === ec.id
                  ? "bg-accent/30 text-foreground ring-accent/50"
                  : "bg-muted/20 text-muted-foreground ring-border/50 hover:bg-muted/40",
              )}
            >
              {ec.label}
            </button>
          ))}
        </div>
        </>
        )}
      </div>

      <div className={cn("flex-1 space-y-4 overflow-y-auto p-3 md:p-4", MOTION_BOOT)}>
        <JourneySummary />
        <StationStamps />
        <ReceiptsFront lines={digest} onDrill={drill} className="hidden" />
        <ReceiptsLedger rows={audit} onOpen={(r) => setDrawerRow(r as AuditRow)} />
        {quiet && (
          <p className="px-1 text-[11.5px] text-muted-foreground">
            Nothing to prove yet. Save, approve or run something and it lands here with a time on it.
          </p>
        )}
        <div className="pt-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px] text-muted-foreground"
            onClick={() => setShowRecord((s) => !s)}
            aria-expanded={showRecord}
          >
            {showRecord ? "Hide the record" : "Show the record"}
          </Button>
        </div>

        {showRecord && (
        <>
        <HeldBackPanel />
        <section>
          <SectionRail
            className="mb-2"
            label="What happened after approval"
            reading={events.length > 0 ? String(events.length) : undefined}
          />
          <SectionNote className="mb-2 mt-0" sectionKey="receipts.lifecycle">
            {sectionNote("receipts.lifecycle")}
          </SectionNote>
          <div className="space-y-1">
            {events.length === 0 && (
              <p className="rounded-md border border-dashed border-border/50 py-4 text-center text-[11px] text-muted-foreground">
                No approvals have moved yet.
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
                  <MachineText className="block text-[10px] text-muted-foreground/70">
                    action {ev.action_id.slice(0, 8)} · {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                  </MachineText>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <SectionRail
            className="mb-2"
            label="Full record"
            reading={
              <>
                {auditFiltered.length}
                {quick ? ` · ${quick}` : ""}
              </>
            }
          />
          <SectionNote className="mb-2 mt-0" sectionKey="receipts.log">
            {sectionNote("receipts.log")}
          </SectionNote>
          <div className="space-y-1">
            {auditFiltered.length === 0 && (
              <p className="rounded-md border border-dashed border-border/50 py-4 text-center text-[11px] text-muted-foreground">
                Nothing matches. Clear filters above.
              </p>
            )}
            {auditFiltered.slice(0, visibleCount).map((r, i) => {
              const open = openId === r.id;
              const fresh = isNewReceipt(r.id);
              return (
              <Card id={`receipt-${r.entity_id ?? r.id}`} key={r.id} className={cn("p-0 text-xs", fresh && MOTION_STAMP, fresh && "vanta-ticket-tear")}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={(e) => {
                    /* Record where the tap happened so any drawer opened from
                       the unfold travels out of this row. */
                    markFlipOriginFromEvent(e);
                    setOpenId(open ? null : r.id);
                  }}
                  className={cn("block w-full rounded-md p-2 text-left hover:bg-muted/30", MOTION_ROW, MOTION_FOCUS)}
                >

                  <div className="flex items-center gap-2">
                    <StatusDot tone={eventTone(r.event)} title={r.event} />
                    {/* Sequence number in the loaded log. Machine data, mono. */}
                    <MachineText className="shrink-0 text-[10px] text-muted-foreground/70">
                      #{auditFiltered.length - i}
                    </MachineText>
                    <Badge
                      variant="outline"
                      className="vanta-machine shrink-0 text-[9px] uppercase tracking-[0.08em]"
                      title={r.entity_type}
                    >
                      {kindLabel(r.entity_type)}
                    </Badge>
                    <span
                      className="min-w-0 flex-1 truncate font-medium text-foreground"
                      title={r.event}
                    >
                      {humanizeEvent(r.event)}
                    </span>
                    <MachineText
                      className={cn("ml-auto shrink-0 text-[10px] text-muted-foreground", fresh && MOTION_TIME_LOCK)}
                      title={`${formatInTimeZone(new Date(r.created_at), timezone, "PPpp")} ${timezone}`}
                    >
                      {formatInTimeZone(new Date(r.created_at), timezone, "HH:mm:ss")}
                    </MachineText>
                  </div>
                  <div className="ml-5 mt-0.5 text-[10.5px] text-muted-foreground">
                    {trustNote(r.event)} · {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })} ·{" "}
                    {open ? "tap to close" : "tap to unfold"}
                  </div>
                </button>
                {open ? (
                  <ReceiptUnfold
                    facts={receiptFacts(r, humanizeEvent(r.event))}
                    at={r.created_at}
                    timezone={timezone}
                    onOpenFull={() => setDrawerRow(r)}
                  />
                ) : null}
              </Card>
              );
            })}
            {auditFiltered.length > visibleCount && (
              <div className="pt-1 text-center">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => setVisibleCount((c) => c + 30)}
                >
                  Show 30 more · {auditFiltered.length - visibleCount} left
                </Button>
              </div>
            )}
          </div>
        </section>
        </>
        )}
      </div>

      <AuditDetailDrawer row={drawerRow} open={!!drawerRow} onOpenChange={(o) => !o && setDrawerRow(null)} />

      <SurfaceAftermath surface="audit" />
    </div>
  );
}
