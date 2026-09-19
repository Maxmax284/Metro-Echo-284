import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, CircleHelp, ClipboardCheck, RadioTower, TriangleAlert, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FlightPlan } from "@/lib/flightPlan";
import {
  LOCAL_SOURCE_WORDS,
  gateProvenance,
  localTransferFacts,
  transferChecklist,
  transferGuidanceKey,
  type BaggageStatus,
  type LocalFactSource,
  type LocalTransferVerification,
  type TransferRoute,
} from "@/lib/transferVerification";

const ACK_PREFIX = "vanta.transfer-guidance.ack";

function readAck(planId: string): string | null {
  try { return localStorage.getItem(`${ACK_PREFIX}.${planId}`); } catch { return null; }
}

export function TransferVerification({
  airport,
  onward,
  confirmed,
  online,
  providerGate,
  providerCheckedAt,
  onConfirm,
}: {
  airport: string;
  onward: FlightPlan;
  confirmed: boolean;
  online: boolean;
  providerGate?: string | null;
  providerCheckedAt?: string | null;
  onConfirm: (facts: Omit<LocalTransferVerification, "verified_at">) => Promise<void>;
}) {
  const saved = localTransferFacts(onward);
  const key = transferGuidanceKey({ airport, planId: onward.id, confirmed, providerGate, providerCheckedAt, local: saved });
  const [acknowledged, setAcknowledged] = useState(() => readAck(onward.id) === key);
  const [open, setOpen] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(saved?.gate ?? "");
  const [boarding, setBoarding] = useState(saved?.boarding_time ?? "");
  const [baggage, setBaggage] = useState<BaggageStatus>(saved?.baggage_status ?? "unknown");
  const [route, setRoute] = useState<TransferRoute>(saved?.transfer_route ?? "unknown");
  const [source, setSource] = useState<LocalFactSource>(saved?.source ?? "departures_board");
  useEffect(() => {
    setAcknowledged(readAck(onward.id) === key);
  }, [key, onward.id]);
  const checklist = useMemo(
    () => transferChecklist({ confirmed, providerGate, local: saved }),
    [confirmed, providerGate, saved],
  );
  const gateRead = gateProvenance(providerGate, saved);
  const flight = onward.options.find((o) => o.id === onward.chosen_option_id) ?? onward.options[0];
  const flightName = flight?.flight_no ?? "your onward flight";
  const destination = onward.destination || "your next stop";

  if (acknowledged && !gateRead.conflict) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/15 p-2.5">
        <Button variant="ghost" size="sm" className="h-8 w-full justify-between px-1 text-[11.5px]" onClick={() => setAcknowledged(false)}>
          Transfer steps kept · {flightName}
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  const save = async () => {
    setBusy(true);
    try {
      await onConfirm({
        gate: gate.trim().toUpperCase() || null,
        boarding_time: boarding.trim() || null,
        baggage_status: baggage,
        transfer_route: route,
        source,
      });
      setReviewing(false);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-2.5 rounded-md border border-primary/35 bg-primary/5 p-3" aria-label="Arrival and transfer next steps">
      <div className="flex items-start gap-2">
        <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground">Arrived at {airport} · onward to {destination}</p>
          <p className="mt-1 text-[11.5px] leading-snug text-foreground/85">
            Check the official departures board or ask the airline transfer or information desk to confirm your gate,
            boarding time, and required transfer steps. Echo will keep what you confirm here.
          </p>
        </div>
      </div>

      {!online ? (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
          <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Offline. Saved details still read here; new local facts can be reviewed when service returns.
        </p>
      ) : null}

      <ul className="space-y-1.5">
        {checklist.map((item) => (
          <li key={item.label} className="flex items-start gap-2 text-[11px] leading-snug">
            {item.state === "known" ? <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden /> : <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />}
            <span><span className="font-medium text-foreground">{item.label}:</span> <span className="text-muted-foreground">{item.detail}</span></span>
          </li>
        ))}
      </ul>

      <div className={cn("rounded-[3px] border p-2", gateRead.conflict ? "border-amber-400/50 bg-amber-400/5" : "border-border/60 bg-muted/15")}>
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
          {gateRead.conflict ? <TriangleAlert className="h-3.5 w-3.5 text-amber-400" aria-hidden /> : <RadioTower className="h-3.5 w-3.5 text-primary" aria-hidden />}
          Gate {gateRead.value}
        </p>
        <p className="mt-0.5 text-[10.5px] text-muted-foreground">Source: {gateRead.source}{providerCheckedAt && !saved?.gate ? ` · ${new Date(providerCheckedAt).toLocaleString()}` : ""}.</p>
        {gateRead.conflict ? <p className="mt-1 text-[10.5px] text-amber-300/90">The local and provider readings disagree. Use the official board or airline staff before moving terminals.</p> : null}
      </div>

      {open ? (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label htmlFor={`local-gate-${onward.id}`} className="text-[11px]">Gate (optional)</Label><Input id={`local-gate-${onward.id}`} value={gate} onChange={(e) => { setGate(e.target.value); setReviewing(false); }} placeholder="C6" className="h-10" /></div>
            <div className="space-y-1"><Label htmlFor={`local-board-${onward.id}`} className="text-[11px]">Boarding time (optional)</Label><Input id={`local-board-${onward.id}`} value={boarding} onChange={(e) => { setBoarding(e.target.value); setReviewing(false); }} placeholder="07:15" className="h-10" /></div>
          </div>
          <div className="space-y-1"><Label htmlFor={`local-bag-${onward.id}`} className="text-[11px]">Checked baggage</Label><select id={`local-bag-${onward.id}`} value={baggage} onChange={(e) => { setBaggage(e.target.value as BaggageStatus); setReviewing(false); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-[12px]"><option value="unknown">Still unknown</option><option value="through_checked">Checked through</option><option value="collect_here">Collect in Taipei</option></select></div>
          <div className="space-y-1"><Label htmlFor={`local-route-${onward.id}`} className="text-[11px]">Required route</Label><select id={`local-route-${onward.id}`} value={route} onChange={(e) => { setRoute(e.target.value as TransferRoute); setReviewing(false); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-[12px]"><option value="unknown">Still unknown</option><option value="airside_transfer">Stay airside / transfer route</option><option value="enter_country">Enter the country / arrivals route</option></select></div>
          <div className="space-y-1"><Label htmlFor={`local-source-${onward.id}`} className="text-[11px]">Where you got this</Label><select id={`local-source-${onward.id}`} value={source} onChange={(e) => { setSource(e.target.value as LocalFactSource); setReviewing(false); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-[12px]">{Object.entries(LOCAL_SOURCE_WORDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          {reviewing ? (
            <div className="space-y-1.5 rounded-[3px] border border-primary/40 bg-primary/5 p-2" role="status">
              <p className="text-[11.5px] font-medium">Review before saving</p>
              <p className="text-[11px] text-muted-foreground">{[gate && `Gate ${gate.toUpperCase()}`, boarding && `boarding ${boarding}`, baggage !== "unknown" && baggage.replace(/_/g, " "), route !== "unknown" && route.replace(/_/g, " ")].filter(Boolean).join(" · ") || "No operational fact entered."} · Source: {LOCAL_SOURCE_WORDS[source]}.</p>
              <p className="text-[10.5px] text-muted-foreground">This records your local verification. It does not book, board, or change the flight's departure time.</p>
              <Button size="sm" className="h-9 w-full text-[12px]" disabled={busy || !online} onClick={() => void save()}>{busy ? "Saving…" : "Confirm and record"}</Button>
            </div>
          ) : <Button size="sm" variant="outline" className="h-9 w-full text-[12px]" disabled={!online} onClick={() => setReviewing(true)}>Review local details</Button>}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" className="h-9 text-[12px]" onClick={() => { setOpen((v) => !v); setReviewing(false); }}>{open ? "Close details" : "Add local details"}</Button>
        <Button size="sm" variant="ghost" className="h-9 text-[12px]" onClick={() => { try { localStorage.setItem(`${ACK_PREFIX}.${onward.id}`, key); } catch { /* stays visible */ } setAcknowledged(true); }}>Got it</Button>
      </div>
      <p className="text-[10.5px] leading-snug text-muted-foreground">Official airport boards and airline staff take precedence over unverified provider data when they differ.</p>
    </section>
  );
}