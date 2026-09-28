// MarkRecordSheet — the record standing behind a station mark.
//
// Tap a stamp on the wall and the wall proves itself: a journey mark replays
// the legs its wrap receipt points at (the journey id is the legs' plan ids
// in order), a place mark shows its press/lift beats from the receipts and
// whether the place is still on the books. Nothing loads until a mark is
// tapped — the wall itself stays one read. When the record is gone (legs
// deleted, place forgotten, or a receipt pressed before marks were linked),
// the sheet says exactly that instead of filling the silence. No
// coordinates, no route history — the name snapshot and the receipts are
// the record.
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { markDateWords, type StationMark, type StationMarkEvent } from "@/lib/stationMarks";
import {
  journeyPlanIds,
  legRecordWords,
  orderLegs,
  placeStampBeats,
  type LegRecord,
} from "@/lib/markRecord";
import { ReceiptSlip } from "@/components/audit/ReceiptSlip";
import { LoadingState } from "@/components/ui/state-views";

type JourneyRecord =
  | { state: "loading" }
  | { state: "unlinked" }
  | { state: "gone" }
  | { state: "ready"; legs: LegRecord[]; corrections: number };

type PlaceRecord =
  | { state: "loading" }
  | { state: "gone" }
  | { state: "ready"; label: string; country: string | null };

function useJourneyRecord(mark: StationMark, open: boolean): JourneyRecord {
  const { user } = useAuth();
  const [record, setRecord] = useState<JourneyRecord>({ state: "loading" });

  useEffect(() => {
    if (!open || !user) return;
    const planIds = journeyPlanIds(mark.recordId);
    if (!planIds.length) {
      setRecord({ state: "unlinked" });
      return;
    }
    setRecord({ state: "loading" });
    let alive = true;
    (async () => {
      const [legsRes, auditRes] = await Promise.all([
        supabase
          .from("flight_plans")
          .select("id, origin, destination, status, leg_state, leg_state_source")
          .eq("user_id", user.id)
          .in("id", planIds),
        supabase
          .from("audit_log")
          .select("entity_id")
          .eq("user_id", user.id)
          .like("event", "flight.%")
          .in("entity_id", planIds)
          .limit(500),
      ]);
      if (!alive) return;
      const legs = (legsRes.data ?? []) as LegRecord[];
      if (legsRes.error || !legs.length) {
        setRecord({ state: "gone" });
        return;
      }
      const corrections = (auditRes.data ?? []).filter((r) => r.entity_id).length;
      setRecord({ state: "ready", legs: orderLegs(legs, planIds), corrections });
    })();
    return () => {
      alive = false;
    };
  }, [open, user, mark.recordId]);

  return record;
}

function usePlaceRecord(mark: StationMark, open: boolean): PlaceRecord {
  const { user } = useAuth();
  const [record, setRecord] = useState<PlaceRecord>({ state: "loading" });

  useEffect(() => {
    if (!open || !user || !mark.recordId) return;
    setRecord({ state: "loading" });
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("awareness_places")
        .select("id, label, country")
        .eq("id", mark.recordId)
        .is("archived_at", null)
        .maybeSingle();
      if (!alive) return;
      if (error || !data) {
        setRecord({ state: "gone" });
        return;
      }
      setRecord({ state: "ready", label: data.label ?? mark.name, country: data.country ?? null });
    })();
    return () => {
      alive = false;
    };
  }, [open, user, mark.recordId, mark.name]);

  return record;
}

function JourneyRecordBody({ mark }: { mark: StationMark }) {
  const record = useJourneyRecord(mark, true);
  if (record.state === "loading") return <LoadingState rows={2} label="Reading the trip record" />;

  return (
    <div className="space-y-3">
      <ReceiptSlip
        title={mark.name}
        meta={`Closed ${markDateWords(mark.at)} · your word`}
        lines={
          record.state === "ready"
            ? [
                { label: "Legs on record", value: String(record.legs.length) },
                {
                  label: "Changes on record",
                  value: String(record.corrections),
                  tone: record.corrections ? "default" : "muted",
                },
                { label: "Closed by", value: "you", tone: "accent" },
              ]
            : [{ label: "Closed by", value: "you", tone: "accent" }]
        }
        stamp="closed by you"
      />
      {record.state === "ready" ? (
        <ul className="space-y-0.5 rounded-md border border-border/50 p-2.5">
          {record.legs.map((leg) => (
            <li key={leg.id} className="font-mono text-[11.5px] leading-snug text-foreground/90">
              {legRecordWords(leg)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          {record.state === "unlinked"
            ? "This wrap was pressed before marks were linked to their records — the receipt above is the record."
            : "The legs are no longer on the books. The wrap receipt above is what remains, and it still stands."}
        </p>
      )}
    </div>
  );
}

function PlaceRecordBody({ mark, rows }: { mark: StationMark; rows: StationMarkEvent[] }) {
  const record = usePlaceRecord(mark, true);
  const beats = placeStampBeats(rows, mark.recordId);
  const presses = beats.filter((b) => b.kind === "pressed").length;
  const lifts = beats.filter((b) => b.kind === "lifted").length;

  return (
    <div className="space-y-3">
      {record.state === "loading" ? (
        <LoadingState rows={1} label="Reading the place record" />
      ) : (
        <ReceiptSlip
          title={mark.name}
          meta={`Pressed ${markDateWords(mark.at)} · your hand`}
          lines={[
            { label: "Presses on record", value: String(presses) },
            { label: "Lifts on record", value: String(lifts), tone: lifts ? "default" : "muted" },
            ...(record.state === "ready"
              ? [
                  {
                    label: "On the books as",
                    value: record.country ? `${record.label} · ${record.country}` : record.label,
                    tone: "accent" as const,
                  },
                ]
              : []),
          ]}
          stamp="pressed"
        />
      )}
      {record.state === "gone" ? (
        <p className="text-[11.5px] leading-snug text-muted-foreground">
          The place itself is no longer on the books. The name above is the snapshot you pressed —
          the mark keeps it.
        </p>
      ) : null}
      {beats.length > 1 ? (
        <ul className="space-y-0.5 rounded-md border border-border/50 p-2.5">
          {beats.map((beat, i) => (
            <li key={`${beat.at}-${i}`} className="font-mono text-[11.5px] leading-snug text-foreground/90">
              {beat.kind === "pressed" ? "Pressed" : "Lifted"} {markDateWords(beat.at)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function MarkRecordSheet({
  mark,
  rows,
  open,
  onOpenChange,
}: {
  mark: StationMark | null;
  /** The same receipts the wall was folded from — a mark's beats ride along. */
  rows: StationMarkEvent[];
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  if (!mark) return null;
  const journey = mark.kind === "journey";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[88dvh] overflow-y-auto rounded-t-2xl pb-[max(env(safe-area-inset-bottom),12px)]"
      >
        <SheetHeader className="text-left">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {journey ? "Trip mark" : "Place mark"}
            </Badge>
            <SheetTitle className="text-[14px]">{mark.name}</SheetTitle>
          </div>
          <SheetDescription className="text-[11.5px]">
            {journey
              ? "The trip as the books hold it — every leg and change that was recorded, nothing inferred."
              : "The stamp's own history, from the receipts. Names are snapshots — never coordinates."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 text-[12px]">
          {journey ? <JourneyRecordBody key={mark.key} mark={mark} /> : <PlaceRecordBody key={mark.key} mark={mark} rows={rows} />}
        </div>

        <p className="mt-3 text-[10.5px] italic text-muted-foreground">
          Receipts are write-once. Echo can't edit history — only add to it.
        </p>
      </SheetContent>
    </Sheet>
  );
}
