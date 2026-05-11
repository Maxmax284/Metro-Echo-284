import { ArrowUp, Loader2, Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

export function ConversationDock({
  placeholder,
  busy,
  onSend,
}: {
  placeholder?: string;
  busy?: boolean;
  onSend: (text: string) => void | Promise<void>;
}) {
  const [v, setV] = useState("");
  const [listening, setListening] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const recRef = useRef<SR | null>(null);
  const baseRef = useRef("");
  const ph = placeholder ?? timeAwarePlaceholder();
  const SRClass = getSpeechRecognition();
  const speechSupported = !!SRClass;

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

  const startListening = () => {
    if (!SRClass) {
      toast.error("Voice input isn't supported in this browser");
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
          toast.error(`Mic: ${e.error}`);
        }
        setListening(false);
      };
      rec.onend = () => setListening(false);
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Mic failed");
      setListening(false);
    }
  };

  const stopListening = () => {
    try { recRef.current?.stop(); } catch { /* noop */ }
    setListening(false);
  };

  return (
    <div className="safe-bottom sticky bottom-[64px] z-30 px-3 pb-2 pt-2 md:bottom-0 md:relative md:px-0 md:pb-0">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl glass px-3 py-2 shadow-lg backdrop-blur-md">
        <textarea
          ref={ref}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
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
          onClick={submit}
          disabled={!v.trim() || busy}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-glow transition-opacity",
            (!v.trim() || busy) && "opacity-50"
          )}
          aria-label="Send"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
