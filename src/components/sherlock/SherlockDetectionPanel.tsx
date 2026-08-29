// SherlockDetectionPanel — tune what Sherlock notices, never what it may do.
//
// Doctrine: this panel changes sensitivity only. There is no switch here that
// grants Sherlock permission to file, link, message or execute anything. Every
// value is clamped server-side too, so a bad number cannot widen a scan.
import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useSherlockSettings } from "@/hooks/useSherlockSettings";
import { useIsOwner } from "@/hooks/useIsOwner";
import type { DetectorKey } from "@/lib/sherlock/types";
import { cn } from "@/lib/utils";

const DETECTORS: Array<{ key: DetectorKey; label: string; hint: string }> = [
  { key: "detect_stale_commitment", label: "Promise past due", hint: "An open promise still sitting past its date." },
  { key: "detect_promise_collides", label: "Promise clashes with a meeting", hint: "Something comes due while you are booked." },
  { key: "detect_near_duplicate_note", label: "Looks like a duplicate", hint: "Two recent notes that open the same way." },
  { key: "detect_notes_disagree", label: "Two notes disagree", hint: "One reads as settled, another as called off." },
  { key: "detect_recurring_entity", label: "Keeps coming up", hint: "The same subject appearing again and again." },
  { key: "detect_entity_gone_quiet", label: "Went quiet", hint: "Something that was busy, then stopped." },
  { key: "detect_obligation_untracked", label: "Document promises", hint: "A document promise nothing is tracking." },
  { key: "detect_unapproved_high_risk", label: "Open risks", hint: "A high risk on a document nobody signed off." },
  { key: "detect_meeting_without_context", label: "Meeting with nothing behind it", hint: "A meeting no record points at." },
];

type NumKey =
  | "stale_promise_days"
  | "duplicate_window_days"
  | "recurring_min_mentions"
  | "quiet_gap_days"
  | "meeting_lookahead_hours"
  | "dismissed_cooldown_days";

const DIALS: Array<{ key: NumKey; label: string; hint: string; presets: number[]; unit: string }> = [
  { key: "stale_promise_days", label: "How overdue before it is worth saying", hint: "Days past the date.", presets: [0, 1, 2, 5, 10], unit: "d" },
  { key: "recurring_min_mentions", label: "Mentions that count as “keeps coming up”", hint: "In a fortnight.", presets: [2, 3, 4, 6, 10], unit: "×" },
  { key: "quiet_gap_days", label: "Silence that counts as “went quiet”", hint: "Days with no mention.", presets: [7, 14, 21, 30, 60], unit: "d" },
  { key: "duplicate_window_days", label: "How far back to compare notes", hint: "For duplicates and disagreements.", presets: [7, 14, 30, 60, 90], unit: "d" },
  { key: "meeting_lookahead_hours", label: "How far ahead to check the calendar", hint: "For clashes and bare meetings.", presets: [12, 24, 48, 96, 168], unit: "h" },
  { key: "dismissed_cooldown_days", label: "Dismissed stays quiet for", hint: "Before it can resurface.", presets: [1, 3, 7, 14, 30], unit: "d" },
];

export function SherlockDetectionPanel() {
  const { settings, loading, update } = useSherlockSettings();
  const isOwner = useIsOwner();
  const [open, setOpen] = useState(false);

  if (isOwner === false) return null;

  if (loading || !settings) {
    return (
      <div className="vanta-card flex items-center gap-2 p-3 text-[11px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reading your detection settings…
      </div>
    );
  }

  const onCount = DETECTORS.filter((d) => Boolean(settings[d.key])).length;

  return (
    <div className="vanta-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          Detection sensitivity
          <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/60">
            {onCount} of {DETECTORS.length} on
          </span>
        </span>
        {open
          ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
          <p className="text-[10.5px] leading-snug text-muted-foreground">
            These settings change what Sherlock notices and how loudly. None of them let it file, link,
            message or run anything — that still needs your approval, every time.
          </p>

          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">What to watch for</p>
            <div className="mt-1.5 space-y-1.5">
              {DETECTORS.map((d) => (
                <label key={d.key} className="flex items-start justify-between gap-3 py-0.5">
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium leading-tight">{d.label}</span>
                    <span className="block text-[10.5px] leading-snug text-muted-foreground">{d.hint}</span>
                  </span>
                  <Switch
                    checked={Boolean(settings[d.key])}
                    onCheckedChange={(v) => void update({ [d.key]: v } as never)}
                    aria-label={d.label}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 pt-2.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">How sensitive</p>
            <div className="mt-1.5 space-y-2.5">
              {DIALS.map((dial) => (
                <div key={dial.key}>
                  <p className="text-[12px] font-medium leading-tight">{dial.label}</p>
                  <p className="text-[10.5px] leading-snug text-muted-foreground">{dial.hint}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {dial.presets.map((v) => (
                      <Button
                        key={v}
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void update({ [dial.key]: v } as never)}
                        className={cn(
                          "h-7 rounded-full px-2.5 text-[11px] ring-1",
                          Number(settings[dial.key]) === v
                            ? "bg-primary/15 text-primary ring-primary/40 hover:bg-primary/20"
                            : "bg-muted/30 text-muted-foreground ring-border/60 hover:bg-muted/50",
                        )}
                      >
                        {v === 0 ? "same day" : `${v}${dial.unit}`}
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-border/60 pt-2.5">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Weekly read</p>
            <div className="mt-1.5 space-y-1.5">
              {([
                ["weekly_digest_enabled", "Compose a weekly digest", "One read-out a week, built from your own records."],
                ["weekly_digest_today", "Show it on Today", "One line, once a week."],
                ["weekly_digest_telegram", "Send it to Telegram", "Off by default. Respects quiet hours."],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="flex items-start justify-between gap-3 py-0.5">
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium leading-tight">{label}</span>
                    <span className="block text-[10.5px] leading-snug text-muted-foreground">{hint}</span>
                  </span>
                  <Switch
                    checked={Boolean(settings[key])}
                    onCheckedChange={(v) => void update({ [key]: v } as never)}
                    aria-label={label}
                  />
                </label>
              ))}
            </div>
          </div>

          <p className="text-[10px] italic text-muted-foreground/70">
            Changes apply on the next look · nothing here starts a scan
          </p>
        </div>
      )}
    </div>
  );
}
