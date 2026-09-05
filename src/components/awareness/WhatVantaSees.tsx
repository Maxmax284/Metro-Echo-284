// What Vanta can see — one honest list of the senses and feeds, built from the
// consent switches and the recorded source health. No new toggles here: each
// row says on or off and one plain sentence about what it helps with. The
// switches themselves live in Settings and stay there.
import { Eye, EyeOff } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useSourceHealth } from "@/hooks/useSourceHealth";
import type { SourceHealth } from "@/lib/sourceHealth";

type Row = { label: string; on: boolean | null; helps: string };

function feedState(sources: SourceHealth[], key: string): boolean | null {
  const s = sources.find((x) => x.key === key);
  if (!s) return null;
  return s.state !== "off" && s.state !== "no_data";
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
      helps: "The shape of your day, read-only. Nothing gets moved or answered.",
    },
    {
      label: "Telegram",
      on: feedState(sources, "telegram"),
      helps: "Messages and photos arrive as captures. Nothing sends without you.",
    },
    {
      label: "Wearable",
      on: feedState(sources, "wearable"),
      helps: "Readings your watch shares, so Vanta can notice a hard week.",
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
                  {r.label} — {r.on === null ? "by request" : r.on ? "on" : "off"}
                </span>
                <p className="text-[11px] leading-snug text-muted-foreground">{r.helps}</p>
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
