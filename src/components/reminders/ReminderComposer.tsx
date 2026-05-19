import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { buildLocalDate, formatTzLine, parseTimeHint, vagueToTime } from "@/lib/timeRules";
import { Clock } from "lucide-react";

export type ReminderResult = {
  due_at: string;     // ISO UTC
  remind_at: string;  // ISO UTC (same as due_at for now)
  timezone: string;   // IANA
};

/**
 * Compact, mobile-friendly reminder composer. Implements Vanta's time rules:
 * - specific time → schedule directly
 * - vague time → suggest default ("Tonight usually means 7 PM. Use that?")
 * - ambiguous AM/PM → ask
 * - no time → ask
 * Returns chosen result to onConfirm; never schedules silently.
 */
export function ReminderComposer({
  initialText = "",
  defaultDayOffset = 0,
  onConfirm,
  onCancel,
}: {
  initialText?: string;
  defaultDayOffset?: number;
  onConfirm: (r: ReminderResult) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { timezone } = useUserTimezone();
  const { prefs } = useUserPreferences();
  const [hint, setHint] = useState(initialText);
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + defaultDayOffset * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [hh, setHh] = useState<number | null>(null);
  const [mm, setMm] = useState<number>(0);
  const [needsAmPm, setNeedsAmPm] = useState(false);

  const parsed = useMemo(() => parseTimeHint(hint), [hint]);

  // Auto-apply parsed hint
  const applyHint = () => {
    if (parsed.kind === "specific") {
      if (!parsed.ampmKnown && parsed.hh <= 12) {
        setHh(parsed.hh);
        setMm(parsed.mm);
        setNeedsAmPm(true);
        return;
      }
      setHh(parsed.hh);
      setMm(parsed.mm);
      setNeedsAmPm(false);
    } else if (parsed.kind === "vague") {
      const t = vagueToTime(parsed.bucket, prefs);
      if (t) { setHh(t.hh); setMm(t.mm); setNeedsAmPm(false); }
    }
  };

  const setAmPm = (ap: "am" | "pm") => {
    if (hh === null) return;
    let h = hh % 12;
    if (ap === "pm") h += 12;
    setHh(h);
    setNeedsAmPm(false);
  };

  const preview = useMemo(() => {
    if (hh === null) return null;
    const base = new Date(`${date}T12:00:00`);
    const built = buildLocalDate(base, hh, mm, timezone, false);
    return built;
  }, [hh, mm, date, timezone]);

  const confirm = async () => {
    if (!preview) return;
    await onConfirm({
      due_at: preview.toISOString(),
      remind_at: preview.toISOString(),
      timezone,
    });
  };

  const vagueSuggest = parsed.kind === "vague" && hh === null
    ? (() => {
        const t = vagueToTime(parsed.bucket, prefs);
        if (!t) return null;
        const label = parsed.bucket === "tonight" || parsed.bucket === "evening"
          ? "evening"
          : parsed.bucket === "morning" ? "morning"
          : parsed.bucket === "afternoon" ? "afternoon"
          : parsed.bucket;
        return `Usually ${label} means ${String(t.hh).padStart(2, "0")}:${String(t.mm).padStart(2, "0")} for you. Use that?`;
      })()
    : null;

  return (
    <div className="space-y-2 rounded-xl bg-surface-elevated/60 p-3 ring-1 ring-border/60">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" /> When should I remind you?
      </div>

      <Input
        autoFocus
        placeholder='Try "tonight", "tomorrow morning", "5pm Friday"'
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        onBlur={applyHint}
        onKeyDown={(e) => { if (e.key === "Enter") { applyHint(); } }}
      />

      {vagueSuggest && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-primary/10 px-2 py-1.5 text-[11.5px] text-foreground ring-1 ring-primary/30">
          <span>{vagueSuggest}</span>
          <Button size="sm" variant="secondary" className="h-7 px-2 text-[11px]" onClick={applyHint}>
            Use it
          </Button>
        </div>
      )}

      {needsAmPm && (
        <div className="flex items-center gap-2 rounded-md bg-warn/10 px-2 py-1.5 text-[11.5px] text-foreground ring-1 ring-warn/30">
          <span>{hh}:{String(mm).padStart(2, "0")} — AM or PM?</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAmPm("am")}>AM</Button>
            <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setAmPm("pm")}>PM</Button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-auto min-w-[140px] flex-1"
        />
        <Input
          type="time"
          value={hh !== null ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}` : ""}
          onChange={(e) => {
            const [h, m] = e.target.value.split(":").map((x) => parseInt(x, 10));
            if (!isNaN(h)) { setHh(h); setMm(isNaN(m) ? 0 : m); setNeedsAmPm(false); }
          }}
          className="h-9 w-auto min-w-[110px] flex-1"
        />
      </div>

      {preview && !needsAmPm && (
        <div className="text-[11.5px] text-muted-foreground">
          Scheduled for <span className="text-foreground">{formatTzLine(preview, timezone)}</span>
        </div>
      )}

      {!preview && (
        <div className="text-[11px] text-muted-foreground italic">
          No time yet. Type one above or pick from the time picker.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        )}
        <Button size="sm" disabled={!preview || needsAmPm} onClick={confirm}>
          Set reminder
        </Button>
      </div>
    </div>
  );
}
