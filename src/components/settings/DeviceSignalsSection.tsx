// DeviceSignalsSection — Phase 8 read-only view of the device capture routes.
//
// Doctrine:
//  - Honest status only. Nothing here claims a route works unless it does.
//  - Read-only: no toggles, no permission prompts, no background probing.
//  - Every row says what it does and where the item lands.
import { useEffect, useState } from "react";
import { Check, X, Minus, Smartphone } from "lucide-react";
import { isStandalonePwa, detectInstallPlatform } from "@/lib/pwaInstall";
import { isNative } from "@/lib/native";
import { cn } from "@/lib/utils";

type Kind = "on" | "off" | "later";

type Row = { kind: Kind; label: string; detail: string };

const ICON: Record<Kind, typeof Check> = { on: Check, off: X, later: Minus };
const TONE: Record<Kind, string> = {
  on: "text-primary",
  off: "text-muted-foreground",
  later: "text-muted-foreground",
};

function buildRows(): Row[] {
  const native = isNative();
  const installed = isStandalonePwa();
  const platform = detectInstallPlatform();
  const finePointer =
    typeof window !== "undefined" && (window.matchMedia?.("(pointer: fine)").matches ?? false);
  const canRecord =
    typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  const clipboardItems = typeof window !== "undefined" && "ClipboardEvent" in window;
  const shareOut =
    native || (typeof navigator !== "undefined" && typeof navigator.share === "function");
  const shareIn = native || installed;

  return [
    {
      kind: shareIn ? "on" : "off",
      label: "Share into Metro Echo",
      detail: shareIn
        ? "Share a photo, PDF or link from another app and it stages in Memory for review."
        : installed
          ? "Available once your phone registers the share sheet."
          : "Install Metro Echo to your home screen first, then Echo appears in the share sheet.",
    },
    {
      kind: clipboardItems ? "on" : "off",
      label: "Paste a screenshot",
      detail: clipboardItems
        ? "Copy a screenshot, then paste anywhere in Metro Echo — it stages in Memory, nothing ingests on its own."
        : "This browser doesn't hand pasted images to web apps.",
    },
    {
      kind: finePointer ? "on" : "later",
      label: "Drag files in",
      detail: finePointer
        ? "Drop files anywhere on the window and they stage in Memory."
        : "Desktop only. On a phone, use Share into Metro Echo instead.",
    },
    {
      kind: canRecord ? "on" : "off",
      label: "Voice notes",
      detail: canRecord
        ? "Record a note and Echo writes it down. Nothing is sent until you tap."
        : "No microphone access in this browser.",
    },
    {
      kind: shareOut ? "on" : "off",
      label: "Share out of Echo",
      detail: shareOut
        ? "Briefs and exports can go straight to your phone's share sheet."
        : "This browser has no share sheet — use Download instead.",
    },
    {
      kind: "later",
      label: "Calendar context",
      detail: "Not connected yet. When it is, Echo will read your day only to add context — never write to it.",
    },
    {
      kind: native ? "on" : "later",
      label: "Native shell",
      detail: native
        ? `Running as an installed app on ${platform}.`
        : installed
          ? "Running as an installed web app."
          : "Running in the browser. Install for the full set of device signals.",
    },
  ];
}

export function DeviceSignalsSection() {
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    setRows(buildRows());
  }, []);

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <Smartphone className="mt-0.5 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Ways to get things into Metro Echo</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            What this device can hand to Metro Echo right now. Everything lands staged — you still decide what's kept.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {rows.map((r) => {
          const Icon = ICON[r.kind];
          return (
            <li
              key={r.label}
              className="flex items-start gap-2.5 rounded-lg bg-muted/20 px-3 py-2.5 ring-1 ring-border/40"
            >
              <Icon className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", TONE[r.kind])} />
              <div className="min-w-0">
                <div className="text-[12.5px] font-medium">{r.label}</div>
                <div className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{r.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
