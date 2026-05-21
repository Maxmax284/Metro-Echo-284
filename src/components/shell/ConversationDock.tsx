import { ArrowUp, Loader2, Mic, MicOff, Paperclip, Square } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { COMPANION_TOOLS, getToolAvailability, type Tool } from "@/lib/companionTools";
import type { AppMode } from "@/hooks/useMode";
import type { SystemControls } from "@/hooks/useSystemControls";

function timeAwarePlaceholder(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late thought to capture?";
  if (h < 11) return "What's the day's shape?";
  if (h < 14) return "Midday check — anything to stage?";
  if (h < 18) return "What needs Vanta's attention?";
  if (h < 22) return "Wrap-up: capture, commit, or plan?";
  return "Anything to log before bed?";
}

// Web Speech API typing
type SR = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): { new (): SR } | null {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

type Props = {
  placeholder?: string;
  busy?: boolean;
  onSend: (text: string) => void | Promise<void>;
  /** Optional: attach button is shown when this is provided. */
  onAttach?: (files: FileList) => void | Promise<void>;
  /** Optional: slash palette picks a registry tool by id. */
  onSlashPick?: (toolId: string) => void;
  /** Required for slash palette filtering. */
  surface?: string;
  mode?: AppMode;
  isOwner?: boolean | null;
  controls?: SystemControls | null;
  /** Stage 6 — externally-driven prefill (e.g. from useSignalRoute `ask_vanta`). */
  initialText?: string | null;
  onInitialTextConsumed?: () => void;
  /** Companion Maturity — abort in-flight stream. When provided + busy, send button becomes Stop. */
  onStop?: () => void;
  /** Rendered inside the sticky dock, directly above the composer (staged chips, trays, etc). */
  aboveComposer?: React.ReactNode;
};

export function ConversationDock({
  placeholder,
  busy,
  onSend,
  onAttach,
  onSlashPick,
  surface = "conversation",
  mode = "advisor",
  isOwner = null,
  controls = null,
  initialText = null,
  onInitialTextConsumed,
  onStop,
  aboveComposer,
}: Props) {
  const [v, setV] = useState("");

  // Stage 6 — apply external prefill, focus, and ack so parent can clear it.
  useEffect(() => {
    if (initialText && initialText.length > 0) {
      setV(initialText);
      requestAnimationFrame(() => {
        ref.current?.focus();
        const len = initialText.length;
        try { ref.current?.setSelectionRange(len, len); } catch { /* noop */ }
      });
      onInitialTextConsumed?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialText]);
  const [listening, setListening] = useState(false);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SR | null>(null);
  const baseRef = useRef("");
  const fileRef = useRef<HTMLInputElement>(null);
  const ph = placeholder ?? timeAwarePlaceholder();
  const SRClass = getSpeechRecognition();
  const speechSupported = !!SRClass;

  // Slash palette state
  const slashActive = !!onSlashPick && v.startsWith("/");
  const slashQuery = slashActive ? v.slice(1).trim().toLowerCase() : "";

  const paletteTools: Tool[] = useMemo(() => {
    if (!slashActive) return [];
    return COMPANION_TOOLS.filter((t) => {
      const a = getToolAvailability(t, { surface, mode, isOwner, controls });
      if (!a.available) return false;
      if (!slashQuery) return true;
      return t.label.toLowerCase().includes(slashQuery) || t.id.includes(slashQuery);
    });
  }, [slashActive, slashQuery, surface, mode, isOwner, controls]);

  useEffect(() => { setPaletteIdx(0); }, [slashQuery, slashActive]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [v]);

  useEffect(() => () => { recRef.current?.abort?.(); }, []);

  const submit = () => {
    const t = v.trim();
    if (!t || busy) return;
    setV("");
    if (listening) stopListening();
    void onSend(t);
  };

  const pickPaletteTool = (tool: Tool) => {
    setV("");
    onSlashPick?.(tool.id);
  };

  const startListening = () => {
    if (!SRClass) {
      toast.error(vantaSay.micUnsupported());
      return;
    }
    try {
      const rec = new SRClass();
      rec.lang = navigator.language || "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      baseRef.current = v ? v + " " : "";
      rec.onresult = (e: any) => {
        let interim = "";
        let final = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) final += r[0].transcript;
          else interim += r[0].transcript;
        }
        if (final) baseRef.current += final;
        setV((baseRef.current + interim).replace(/\s+/g, " ").trimStart());
      };
      rec.onerror = (e: any) => {
        if (e?.error && e.error !== "aborted" && e.error !== "no-speech") {
          toast.error(vantaSay.micError(e.error));
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      toast.fromError(err, vantaSay.micError());
      setListening(false);
    }
  };

  const stopListening = () => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  };

  return (
    <div className="safe-bottom sticky bottom-[64px] z-30 px-3 pb-2 pt-2 md:bottom-0 md:relative md:px-0 md:pb-0">
      {/* Slash palette */}
      {slashActive && paletteTools.length > 0 && (
        <div className="mx-auto mb-1.5 w-full max-w-3xl overflow-hidden rounded-2xl glass shadow-lg backdrop-blur-md">
          <div className="border-b border-border/40 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            Tools · ↑↓ Enter
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {paletteTools.map((t, i) => {
              const Icon = t.icon;
              const active = i === paletteIdx;
              return (
                <li
                  key={t.id}
                  role="option"
                  aria-selected={active}
                  onMouseEnter={() => setPaletteIdx(i)}
                  onMouseDown={(e) => { e.preventDefault(); pickPaletteTool(t); }}
                  className={cn(
                    "flex cursor-pointer items-start gap-2 px-3 py-2 text-[13px]",
                    active ? "bg-primary/10 text-foreground" : "text-foreground/85"
                  )}
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 text-primary/80" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.label}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{t.description}</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {aboveComposer && (
        <div className="mx-auto mb-1.5 w-full max-w-3xl">{aboveComposer}</div>
      )}

      <div className="mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-2xl glass px-3 py-2 shadow-lg backdrop-blur-md">
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) void onAttach(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              aria-label="Attach file"
              title="Attach"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-muted-foreground ring-1 ring-border/60 transition-colors hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </>
        )}
        <textarea
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            // Slash palette navigation
            if (slashActive && paletteTools.length > 0) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setPaletteIdx((i) => (i + 1) % paletteTools.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setPaletteIdx((i) => (i - 1 + paletteTools.length) % paletteTools.length);
                return;
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                pickPaletteTool(paletteTools[paletteIdx]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setV("");
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={listening ? "Listening…" : ph}
          className={cn(
            "flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          )}
        />
        {speechSupported && (
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={busy}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={listening ? "Stop" : "Speak"}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
              listening
                ? "bg-warn/20 text-warn ring-1 ring-warn/40 animate-pulse"
                : "bg-surface-elevated text-muted-foreground hover:text-foreground ring-1 ring-border/60"
            )}
          >
            {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        )}
        <button
          onClick={busy && onStop ? onStop : submit}
          disabled={busy ? !onStop : !v.trim()}
          type="button"
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-primary-foreground shadow-glow transition-opacity",
            busy && onStop
              ? "bg-destructive"
              : "bg-gradient-to-br from-primary to-primary-glow",
            ((busy && !onStop) || (!busy && !v.trim())) && "opacity-50"
          )}
          aria-label={busy && onStop ? "Stop" : "Send"}
        >
          {busy
            ? (onStop ? <Square className="h-3.5 w-3.5 fill-current" /> : <Loader2 className="h-4 w-4 animate-spin" />)
            : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
