import { ArrowUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function ConversationDock({
  placeholder = "Tell Vanta…",
  busy,
  onSend,
}: {
  placeholder?: string;
  busy?: boolean;
  onSend: (text: string) => void | Promise<void>;
}) {
  const [v, setV] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
  }, [v]);

  const submit = () => {
    const t = v.trim();
    if (!t || busy) return;
    setV("");
    void onSend(t);
  };

  return (
    <div className="safe-bottom sticky bottom-0 z-20 px-3 pb-3 pt-2 md:relative md:px-0 md:pb-0">
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl glass px-3 py-2 shadow-lg">
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
          placeholder={placeholder}
          className={cn(
            "flex-1 resize-none bg-transparent py-1.5 text-[15px] leading-snug text-foreground placeholder:text-muted-foreground/70 focus:outline-none"
          )}
        />
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
