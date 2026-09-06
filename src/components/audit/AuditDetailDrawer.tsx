// AuditDetailDrawer — the plain-English receipt for one audit row.
// User taps any row in Receipts and sees: what happened, when, who/what
// it touched, and (optionally, behind a dev toggle) the raw payload.
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { humanizeEvent, kindLabel, trustNote } from "@/lib/plainLabels";
import { Code2 } from "lucide-react";
import { ReceiptSlip } from "@/components/audit/ReceiptSlip";
import { useFlipEntry } from "@/hooks/useFlipEntry";
import { AskAboutButton } from "@/components/ask/AskAboutButton";

type AuditRow = {
  id: string;
  event: string;
  entity_type: string;
  entity_id: string | null;
  payload: any;
  created_at: string;
};

const DEV_KEY = "vanta.dev_details";

/** Best-effort plain-English summary of an audit payload.
 * Tries common shapes first, falls back to a key/value bullet list. */
function payloadFacts(row: AuditRow, timezone: string): { label: string; value: string }[] {
  /* A receipt never shows a machine timestamp: same clock the rest of the room uses. */
  const when = (v: unknown): string => {
    const d = new Date(String(v));
    return isNaN(d.getTime()) ? String(v) : formatInTimeZone(d, timezone, "d MMM HH:mm");
  };
  const out: { label: string; value: string }[] = [];
  const p = row.payload ?? {};
  if (typeof p !== "object") return out;

  const pretty = (v: any): string => {
    if (v === null || v === undefined) return "—";
    if (typeof v === "string") {
      // shorten obvious uuids
      if (/^[0-9a-f]{8}-/.test(v)) return v.slice(0, 8) + "…";
      return v.length > 80 ? v.slice(0, 80) + "…" : v;
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
    return "(details)";
  };

  // Friendly aliases for common keys.
  const labelMap: Record<string, string> = {
    capture_id: "Capture",
    note_id: "Note",
    commitment_id: "Commitment",
    action_id: "Action",
    file_id: "File",
    brief_id: "Brief",
    export_id: "Export",
    target_id: "Target",
    source: "Came from",
    destination: "Sent to",
    via: "Drafted by",
    reason: "Reason",
    hours: "Snooze (hours)",
    until: "Until",
    format: "Format",
    user_action: "What you did",
    from: "Was",
    to: "Now",
  };

  // Hide noisy / internal keys.
  const hide = new Set(["audit_event_id", "previous_status", "new_status", "embedding"]);

  /* Provenance is the point of a receipt: which source the draft stood on,
     where it was asked, and when. Read it out instead of printing "(details)". */
  const prov = (p as any).provenance;
  if (prov && typeof prov === "object") {
    const srcs = Array.isArray(prov.sources) ? prov.sources : [];
    if (srcs.length) {
      out.push({
        label: "Stood on",
        value: srcs.map((s: any) => String(s?.name ?? "a source")).slice(0, 3).join(", "),
      });
      const from = srcs.map((s: any) => s?.source).find(Boolean);
      if (from) out.push({ label: "Source arrived by", value: String(from) });
    }
    if (prov.surface) out.push({ label: "Asked in", value: String(prov.surface) });
    if (prov.context_label) out.push({ label: "About", value: String(prov.context_label) });
    if (prov.asked_at) out.push({ label: "Asked", value: when(prov.asked_at) });
  }

  for (const [k, v] of Object.entries(p)) {
    if (hide.has(k) || k === "provenance") continue;
    const isTime = k === "drafted_at" || k.endsWith("_at");
    out.push({ label: labelMap[k] ?? k.replace(/_/g, " "), value: isTime ? when(v) : pretty(v) });
  }
  return out.slice(0, 14);
}

export function AuditDetailDrawer({
  row,
  open,
  onOpenChange,
  footer,
}: {
  row: AuditRow | null;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  /** Optional extra control (e.g. "See in Receipts") shown under the facts. */
  footer?: ReactNode;
}) {
  const { timezone } = useUserTimezone();
  /* Matched-layout travel: the sheet body grows out of the row you tapped. */
  const flipRef = useFlipEntry<HTMLDivElement>(open && !!row);
  const [showDev, setShowDev] = useState<boolean>(() => {
    try { return localStorage.getItem(DEV_KEY) === "1"; } catch { return false; }
  });
  const toggleDev = () => {
    const next = !showDev;
    setShowDev(next);
    try { localStorage.setItem(DEV_KEY, next ? "1" : "0"); } catch { /* noop */ }
  };

  if (!row) return null;
  const facts = payloadFacts(row, timezone);
  const exact = formatInTimeZone(new Date(row.created_at), timezone, "PPpp");
  const ago = formatDistanceToNow(new Date(row.created_at), { addSuffix: true });

  /* The verdict word on the stamp. Receipts are printed, so they get a mark. */
  const stamp = /execut/i.test(row.event)
    ? "executed"
    : /rollback|revert|undo/i.test(row.event)
      ? "rolled back"
      : /approve/i.test(row.event)
        ? "approved"
        : "logged";

  const slipLines = [
    { label: "When", value: ago, tone: "default" as const },
    { label: "Exact", value: `${exact}`, tone: "muted" as const },
    { label: "Zone", value: timezone, tone: "muted" as const },
    ...(row.entity_id
      ? [{ label: kindLabel(row.entity_type), value: `${row.entity_id.slice(0, 8)}…`, tone: "muted" as const }]
      : []),
    ...facts.map((f) => ({ label: f.label, value: f.value, tone: "default" as const })),
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]">
        <div ref={flipRef}>
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">{kindLabel(row.entity_type)}</Badge>
            <SheetTitle className="text-[14px]">{humanizeEvent(row.event)}</SheetTitle>
          </div>
          <SheetDescription className="text-[11.5px]">
            {trustNote(row.event)}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 space-y-3 text-[12px]">
          <ReceiptSlip
            title={humanizeEvent(row.event)}
            meta={`${exact} · ${timezone}`}
            lines={slipLines}
            stamp={stamp}
          />


          <div className="flex flex-wrap items-center justify-end gap-1.5 pt-0.5">
            <AskAboutButton
              kind="receipt"
              id={row.id}
              label={humanizeEvent(row.event)}
              question={`Explain this receipt: ${humanizeEvent(row.event)}.`}
            />
            {footer}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <p className="text-[10.5px] italic text-muted-foreground">
              Receipts are write-once. Echo can't edit history — only add to it.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-[10.5px] text-muted-foreground"
              onClick={toggleDev}
            >
              <Code2 className="h-3 w-3" />
              {showDev ? "Hide raw" : "Show raw"}
            </Button>
          </div>

          {showDev && row.payload && (
            <pre className="max-h-64 overflow-auto rounded-md bg-muted/40 p-2 text-[10px] leading-snug text-muted-foreground">
              {JSON.stringify({ event: row.event, entity_type: row.entity_type, entity_id: row.entity_id, payload: row.payload }, null, 2)}
            </pre>
          )}
        </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
