import {
  ArrowUp,
  Camera,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Mic,
  MicOff,
  Paperclip,
  Square,
} from "lucide-react";
import { play, unlockAudio } from "@/lib/streetSound";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { vantaToast as toast, vantaSay } from "@/lib/vantaVoice";
import { COMPANION_TOOLS, getToolAvailability, type Tool, type ToolScope } from "@/lib/companionTools";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useScope } from "@/hooks/useScope";
import type { AppMode } from "@/hooks/useMode";
import type { SystemControls } from "@/hooks/useSystemControls";

/** What each attach route accepts. Camera is a route, not a separate surface. */
const ACCEPT = {
  any: undefined as unknown as string | undefined,
  image: "image/*",
  document: ".pdf,.doc,.docx,.txt,.md,.rtf,.csv,.xls,.xlsx,application/pdf",
} as const;

function AttachOption({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Camera;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[3px] px-2 py-1.5 text-left text-[13px] text-foreground/90 transition-colors hover:bg-surface-elevated"
    >
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      {label}
    </button>
  );
}


function timeAwarePlaceholder(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late thought to capture?";
  if (h < 11) return "What's the day's shape?";
  if (h < 14) return "Midday check — anything to stage?";
  if (h < 18) return "What needs Echo's attention?";
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
  /** Optional: open the deliberate camera seam — Echo looks at one picture. */
  onLook?: () => void;
  /** Optional: slash palette picks a registry tool by id. */
  onSlashPick?: (toolId: string) => void;
  /** Required for slash palette filtering. */
  surface?: string;
  mode?: AppMode;
  isOwner?: boolean | null;
  controls?: SystemControls | null;
  /** Stage 6 — externally-driven prefill (e.g. from useSignalRoute `ask_vanta`). */
  initialText?: string | null;
  /** The prefill is a finished question: send it instead of parking it. */
  initialTextSubmit?: boolean;
  onInitialTextConsumed?: () => void;
  /** Companion Maturity — abort in-flight stream. When provided + busy, send button becomes Stop. */
  onStop?: () => void;
  /** Rendered inside the sticky dock, directly above the composer (staged chips, trays, etc). */
  aboveComposer?: ReactNode;
  /** Wave 4 — persisted composer text, so a half-typed line survives moving
      between quick Ask and the Ask room. */
  draft?: string;
  onDraftChange?: (text: string) => void;
};

export function ConversationDock({
  placeholder,
  busy,
  onSend,
  onAttach,
  onLook,
  onSlashPick,
  surface = "conversation",
  mode = "advisor",
  isOwner = null,
  controls = null,
  initialText = null,
  initialTextSubmit = false,
  onInitialTextConsumed,
  onStop,
  aboveComposer,
  draft,
  onDraftChange,
}: Props) {
  const [v, setV] = useState(draft ?? "");

  // The draft belongs to the thread, not to this mount: adopt it when the
  // owning surface hands us a different one (thread switch, surface switch).
  const lastDraft = useRef(draft ?? "");
  useEffect(() => {
    const next = draft ?? "";
    if (next !== lastDraft.current) { lastDraft.current = next; setV(next); }
  }, [draft]);
  // The callback identity changes every parent render, so it lives in a ref and
  // only a real text change publishes upward. Otherwise draft -> render -> draft.
  const onDraftChangeRef = useRef(onDraftChange);
  onDraftChangeRef.current = onDraftChange;
  useEffect(() => {
    if (v === lastDraft.current) return;
    lastDraft.current = v;
    onDraftChangeRef.current?.(v);
  }, [v]);

  // Stage 6 — apply external prefill, focus, and ack so parent can clear it.
  const sentPrefill = useRef<string | null>(null);
  useEffect(() => {
    if (initialText && initialText.length > 0) {
      /* A question handed over whole gets asked. Parking it in the box and
         waiting for a second tap reads as if nothing happened. One send per
         handover, though — a remount must never ask twice. */
      if (initialTextSubmit && !busy) {
        if (sentPrefill.current === initialText) return;
        sentPrefill.current = initialText;
        setV("");
        onInitialTextConsumed?.();
        void onSend(initialText);
        return;
      }
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
  const photoRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);
  // Camera only where there is one to point: never offer a route that dead-ends.
  const hasCamera =
    typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const ph = placeholder ?? timeAwarePlaceholder();
  const SRClass = getSpeechRecognition();
  const speechSupported = !!SRClass;

  // Slash palette state
  const { scope: activeScope } = useScope();
  const toolScope: ToolScope =
    activeScope.type === "organization" ? "organization" : activeScope.type === "admin" ? "admin" : "personal";
  const slashActive = !!onSlashPick && v.startsWith("/");
  const slashQuery = slashActive ? v.slice(1).trim().toLowerCase() : "";

  const paletteTools: Tool[] = useMemo(() => {
    if (!slashActive) return [];
    return COMPANION_TOOLS.filter((t) => {
      const a = getToolAvailability(t, { surface, mode, isOwner, controls, scope: toolScope, direct: true });
      if (!a.available) return false;
      if (!slashQuery) return true;
      return t.label.toLowerCase().includes(slashQuery) || t.id.includes(slashQuery);
    });
  }, [slashActive, slashQuery, surface, mode, isOwner, controls, toolScope]);

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
    // The composer sits over the room wall, so it carries its own scrim: text
    // stays readable and the bottom nav keeps its clearance on phones.
    <div className="safe-bottom sticky bottom-[68px] z-30 bg-gradient-to-t from-background via-background/90 to-transparent px-3 pb-3 pt-3 md:bottom-0 md:relative md:bg-none md:px-0 md:pb-0">
      {/* Slash palette */}
      {slashActive && paletteTools.length > 0 && (
        <div className="mx-auto mb-1.5 w-full max-w-3xl overflow-hidden rounded-2xl glass bg-background/85 shadow-lg backdrop-blur-xl">
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

      <div className="mx-auto flex w-full max-w-3xl items-end gap-1.5 rounded-2xl glass bg-background/85 px-3 py-2 shadow-lg backdrop-blur-xl">
        {onAttach && (
          <>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={ACCEPT.any}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) void onAttach(e.target.files);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
            <input
              ref={photoRef}
              type="file"
              multiple
              accept={ACCEPT.image}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) void onAttach(e.target.files);
                if (photoRef.current) photoRef.current.value = "";
              }}
            />
            {/* Camera is an input method, not a section: same composer, same thread. */}
            <input
              ref={cameraRef}
              type="file"
              accept={ACCEPT.image}
              capture="environment"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) void onAttach(e.target.files);
                if (cameraRef.current) cameraRef.current.value = "";
              }}
            />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Attach"
                  title="Attach"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-elevated text-muted-foreground ring-1 ring-border/60 transition-colors hover:text-foreground active:scale-95"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-56 p-1">
                {onLook && (
                  <>
                    <AttachOption icon={Eye} label="Show Echo something" onClick={onLook} />
                    <div className="my-1 h-px bg-border/50" />
                  </>
                )}
                {hasCamera && (
                  <AttachOption icon={Camera} label="Take a photo" onClick={() => cameraRef.current?.click()} />
                )}
                <AttachOption icon={ImageIcon} label="Photo library" onClick={() => photoRef.current?.click()} />
                <AttachOption icon={FileText} label="Document" onClick={() => docRef.current?.click()} />
                <AttachOption icon={Paperclip} label="Any file" onClick={() => fileRef.current?.click()} />
              </PopoverContent>
            </Popover>
            <input
              ref={docRef}
              type="file"
              multiple
              accept={ACCEPT.document}
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) void onAttach(e.target.files);
                if (docRef.current) docRef.current.value = "";
              }}
            />
          </>
        )}
        <textarea
          ref={ref}
          value={v}
          /* Picking up the can: two rattles of the mixing ball before you spray.
             Opt-in sound only, and the first touch is what wakes audio up. */
          onFocus={() => {
            unlockAudio();
            play("spray");
          }}
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
