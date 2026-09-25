// WeatherGauge — a small analog weather relay on the place board.
// A split-flap temperature, a CRT-style animated glyph, and one honest
// field line (feels-like, humidity). Motion is ambient only; reduced motion
// gets the still glyph and the same words.
import { useState } from "react";
import { SolariWord } from "@/components/today/SignalBeacon";
import { cn } from "@/lib/utils";

const UNIT_KEY = "vanta.tempunit";
type TempUnit = "c" | "f";

function readUnit(): TempUnit {
  try {
    return localStorage.getItem(UNIT_KEY) === "f" ? "f" : "c";
  } catch {
    return "c";
  }
}

const toF = (c: number) => c * 9 / 5 + 32;

export type LiveWeather = {
  temp: number;
  feels: number | null;
  humidity: number | null;
  code: number;
  precip: number;
  isDay: boolean;
  label: string;
};

export type WxKind = "sun" | "moon" | "cloud" | "fog" | "rain" | "snow" | "storm";

export function wxKind(code: number, isDay: boolean): WxKind {
  if (code <= 1) return isDay ? "sun" : "moon";
  if (code <= 3) return "cloud";
  if (code <= 48) return "fog";
  if (code <= 67 || (code >= 80 && code <= 82)) return "rain";
  if (code <= 77 || code === 85 || code === 86) return "snow";
  return "storm";
}

function Glyph({ kind }: { kind: WxKind }) {
  return (
    <span aria-hidden className={cn("wx-glyph", `wx-${kind}`)}>
      {(kind === "sun" || kind === "moon") && <span className="wx-orb" />}
      {kind === "sun" && <span className="wx-rays" />}
      {kind !== "sun" && kind !== "moon" && <span className="wx-cloud" />}
      {kind === "cloud" && <span className="wx-cloud wx-cloud-back" />}
      {kind === "fog" && (<><span className="wx-fogline" /><span className="wx-fogline wx-fogline-2" /></>)}
      {(kind === "rain" || kind === "storm") &&
        [0, 1, 2].map((i) => <span key={i} className="wx-drop" style={{ left: `${30 + i * 18}%`, animationDelay: `${i * 0.27}s` }} />)}
      {kind === "snow" &&
        [0, 1, 2].map((i) => <span key={i} className="wx-flake" style={{ left: `${28 + i * 20}%`, animationDelay: `${i * 0.6}s` }} />)}
      {kind === "storm" && <span className="wx-bolt" />}
      <span className="wx-scan" />
    </span>
  );
}

export function WeatherGauge({ wx, className }: { wx: LiveWeather; className?: string }) {
  const kind = wxKind(wx.code, wx.isDay);
  const rough = kind === "rain" || kind === "storm";
  const hot = (wx.feels ?? wx.temp) >= 33;
  const field = [
    wx.feels != null && Math.round(wx.feels) !== Math.round(wx.temp) ? `feels ${Math.round(wx.feels)}°` : null,
    wx.humidity != null ? `humidity ${Math.round(wx.humidity)}%` : null,
    rough ? "roads slick" : hot ? "find shade" : null,
  ].filter(Boolean).join(" · ");
  return (
    <div className={cn("wx-gauge inline-flex items-center gap-2.5 rounded-md border border-border/60 bg-background/60 px-2.5 py-1.5", className)} role="status" aria-label={`${Math.round(wx.temp)} degrees, ${wx.label}${field ? `, ${field}` : ""}`}>
      <Glyph kind={kind} />
      <span className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5">
          <SolariWord word={`${Math.round(wx.temp)}°`} tone={rough || hot ? "hold" : "live"} />
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/80">{wx.label}</span>
          <span aria-hidden className={cn("wx-led", rough ? "is-warn" : "is-ok")} />
        </span>
        {field && <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">{field}</span>}
      </span>
    </div>
  );
}
