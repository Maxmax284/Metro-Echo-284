// What Vanta can see — one honest list of the senses and feeds, built from the
// consent switches and the recorded source health. No new toggles here: each
// row says on or off, what it helps with, and — where there is a recorded
// moment — when it last had something to say. The switches themselves live in
// Settings and stay there.
import { Eye, EyeOff } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSourceHealth } from "@/hooks/useSourceHealth";
import type { SourceHealth } from "@/lib/sourceHealth";

type Row = {
  label: string;
  /** true on, false off, null decided in the moment by you. */
  on: boolean | null;
  /** A feed with nothing set up yet: neither on nor a matter of consent. */
  unset?: boolean;
  helps: string;
  /** Evidence for the row, when something was actually recorded. */
  proof?: string | null;
};

function feedState(sources: SourceHealth[], key: string): boolean | null {
  const s = sources.find((x) => x.key === key);
  if (!s) return null;
  return s.state !== "off" && s.state !== "no_data";
}

function feedMissing(sources: SourceHealth[], key: string): boolean {
  return !sources.some((x) => x.key === key);
}

function feedProof(sources: SourceHealth[], key: string): string | null {
  const s = sources.find((x) => x.key === key);
  if (!s) return null;
  return s.proof || null;
}

/** One sentence about the whole picture. Counted from the rows, never guessed. */
function statusLine(rows: Row[]): string {
  const on = rows.filter((r) => r.on === true && !r.unset).map((r) => r.label);
  const off = rows.filter((r) => r.on === false || r.unset).map((r) => r.label);
  if (on.length === 0) {
    return "Nothing is feeding Vanta yet, so this room can only work from what you tell it.";
  }
  const onPart = on.length === rows.length ? "Everything is feeding Vanta" : `${on.join(", ")} ${on.length === 1 ? "is" : "are"} feeding Vanta`;
  if (off.length === 0) return `${onPart}. Nothing is switched off.`;
  return `${onPart}. ${off.join(" and ")} ${off.length === 1 ? "is" : "are"} off, so nothing here comes from ${off.length === 1 ? "it" : "them"}.`;
}

export function WhatVantaSees({ className }: { className?: string }) {
  const { prefs } = useUserPreferences();
  const { sources } = useSourceHealth();
  const consent = (prefs.sensor_consent ?? {}) as Record<string, boolean>;

  const rows: Row[] = [
    {
      label: "Location",
      on: consent.location === true,
      helps: "Timing and travel context — city-level, never a live trail.",
    },
    {
      label: "Calendar",
      on: feedState(sources, "calendar"),
      unset: feedMissing(sources, "calendar"),
      helps: "The shape of your day, read-only. Nothing gets moved or answered.",
      proof: feedProof(sources, "calendar"),
    },
    {
      label: "Telegram",
      on: feedState(sources, "telegram"),
      unset: feedMissing(sources, "telegram"),
      helps: "Messages, photos and voice notes arrive as captures. Nothing sends without you.",
      proof: feedProof(sources, "telegram"),
    },
    {
      label: "Wearable",
      on: feedState(sources, "wearable"),
      unset: feedMissing(sources, "wearable"),
      helps: "Readings your watch shares, so Vanta can notice a hard week.",
      proof: feedProof(sources, "wearable"),
    },
    {
      label: "Camera",
      on: null,
      helps: "Only when you tap to show Vanta something. It never looks on its own.",
    },
    {
      label: "Microphone",
      on: consent.microphone === true,
      helps: "Only while you hold record. Nothing listens in the background.",
    },
  ];

  return (
    <section className={className} aria-label="What Vanta can see">
      <div className="vanta-card rounded-xl p-3">
        <div className="text-[12px] font-semibold">What Vanta can see</div>
        <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{statusLine(rows)}</p>
        <ul className="mt-2 space-y-2">
          {rows.map((r) => (
            <li key={r.label} className="flex items-start gap-2">
              {r.on === true ? (
                <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              ) : (
                <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              )}
              <div className="min-w-0">
                <span className="text-[11.5px] font-medium">
                  {r.label} — {r.unset ? "not set up yet" : r.on === null ? "by request" : r.on ? "on" : "off"}
                </span>
                <p className="text-[11px] leading-snug text-muted-foreground">{r.helps}</p>
                {r.proof ? (
                  <p className="text-[10.5px] leading-snug text-muted-foreground/70">{r.proof}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[10.5px] text-muted-foreground/70">
          The switches live in Settings. This list only reports.
        </p>
      </div>
    </section>
  );
}
