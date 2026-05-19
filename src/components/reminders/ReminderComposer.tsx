import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserTimezone } from "@/hooks/useUserTimezone";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { buildLocalDate, formatTzLine, parseTimeHint, vagueToTime } from "@/lib/timeRules";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export type ReminderResult = {
  due_at: string;      // ISO UTC
  remind_at: string;   // ISO UTC (may precede due_at)
  timezone: string;    // IANA
  title?: string;      // optional editable title (when initialTitle provided)
};

const OFFSETS: { label: string; minutes: number }[] = [
  { label: "At due time", minutes: 0 },
  { label: "5 min before", minutes: 5 },
  { label: "30 min before", minutes: 30 },
  { label: "1 hr before", minutes: 60 },
  { label: "1 day before", minutes: 60 * 24 },
];

/**
 * Compact, mobile-friendly reminder composer. Implements Vanta's time rules
 * and the doctrine's aftermath rule: title is the next-life verb, and
 * remind_at can lead due_at so reminders actually nudge before the deadline.
 */
export function ReminderComposer({
  initialText = "",
  initialTitle,
  defaultDayOffset = 0,
  onConfirm,
  onCancel,
}: {
  initialText?: string;
  initialTitle?: string;            // when provided, renders an editable title input
  defaultDayOffset?: number;
  onConfirm: (r: ReminderResult) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { timezone } = useUserTimezone();
  const { prefs } = useUserPreferences();
  const [title, setTitle] = useState(initialTitle ?? "");
  const [hint, setHint] = useState(initialText);
  const [date, setDate] = useState(() => {
    const d = new Date(Date.now() + defaultDayOffset * 24 * 3600 * 1000);
    return d.toISOString().slice(0, 10);
  });
  const [hh, setHh] = useState<number | null>(null);
  const [mm, setMm] = useState<number>(0);
  const [needsAmPm, setNeedsAmPm] = useState(false);
  const [offsetMin, setOffsetMin] = useState<number>(0);

  const parsed = useMemo(() => parseTimeHint(hint), [hint]);

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

  const dueDate = useMemo(() => {
    if (hh === null) return null;
    const base = new Date(`${date}T12:00:00`);
    return buildLocalDate(base, hh, mm, timezone, false);
  }, [hh, mm, date, timezone]);

  const remindDate = useMemo(() => {
    if (!dueDate) return null;
    return new Date(dueDate.getTime() - offsetMin * 60 * 1000);
  }, [dueDate, offsetMin]);

  const titleRequired = initialTitle !== undefined;
  const canConfirm = !!dueDate && !needsAmPm && (!titleRequired || title.trim().length > 0);

  const confirm = async () => {
    if (!dueDate || !remindDate) return;
    await onConfirm({
      due_at: dueDate.toISOString(),
      remind_at: remindDate.toISOString(),
      timezone,
      title: titleRequired ? title.trim() : undefined,
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
      {titleRequired && (
        <div className="space-y-1">
          <label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">What's the next move?</label>
          <Input
            placeholder="e.g. Review receipt before reimbursement"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
      )}

      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3" /> When should this be done?
      </div>

      <Input
        autoFocus={!titleRequired}
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

      <div className="space-y-1">
        <label className="text-[10.5px] uppercase tracking-wide text-muted-foreground">Remind me</label>
        <div className="-mx-1 flex snap-x snap-mandatory gap-1 overflow-x-auto px-1">
          {OFFSETS.map((o) => (
            <button
              key={o.minutes}
              type="button"
              onClick={() => setOffsetMin(o.minutes)}
              className={cn(
                "shrink-0 snap-start rounded-full border px-2 py-0.5 text-[10.5px] transition-colors",
                offsetMin === o.minutes
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border/60 bg-surface-elevated/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {dueDate && remindDate && !needsAmPm && (
        <div className="space-y-0.5 text-[11.5px] text-muted-foreground">
          <div>Due <span className="text-foreground">{formatTzLine(dueDate, timezone)}</span></div>
          {offsetMin > 0 && (
            <div>Nudge <span className="text-foreground">{formatTzLine(remindDate, timezone)}</span></div>
          )}
        </div>
      )}

      {!dueDate && (
        <div className="text-[11px] text-muted-foreground italic">
          No time yet. Type one above or pick from the time picker.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        {onCancel && (
          <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        )}
        <Button size="sm" disabled={!canConfirm} onClick={confirm}>
          Set reminder
        </Button>
      </div>
    </div>
  );
}
