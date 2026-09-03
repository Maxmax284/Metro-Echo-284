// DeskIntro — the same five-part skeleton on every Work desk.
//
//   1  what happens here
//   2  do this            (verb-first taps, the recommended one marked)
//   3  Vanta can help     (each one only ever prepares something)
//   4  the desk itself    (the surface's own records, or DeskExample when empty)
//   5  what happens next
//
// Doctrine: teaching collapses once you have records — it is learned, then it
// gets out of the way. Assists hand the desk to Ask with a prefilled question;
// they never send, file, approve or execute anything.
import { ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { DESK_TEACHING } from "@/lib/deskTeaching";
import { DESK_VERB, type DeskKey } from "@/lib/deskRoles";
import { DeskExample } from "@/components/work/DeskExample";
import { useAskContext } from "@/hooks/useAskContext";
import type { ThreadContextKind } from "@/lib/askThreads";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";

export function DeskIntro({
  deskKey,
  /** True once the desk holds at least one real record. */
  populated,
  /** Runs a desk's own tap when the surface can honour it. */
  onDo,
  className,
}: {
  deskKey: DeskKey;
  populated: boolean;
  onDo?: (label: string) => void;
  className?: string;
}) {
  const t = DESK_TEACHING[deskKey];
  const { openAskWithContext } = useAskContext();
  const storageKey = `vanta.deskIntro.${deskKey}`;

  /* Empty desk: open, because there is nothing else to look at. Populated:
     folded, unless the user chose otherwise on this device. */
  const [open, setOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return !populated;
    const saved = window.localStorage.getItem(storageKey);
    if (saved !== null) return saved === "1";
    return !populated;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {
      /* private mode — the fold is a nicety */
    }
  }, [storageKey, open]);

  return (
    <section className={cn("rounded-xl border border-border/60 bg-surface-elevated/40 p-3", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn("flex w-full items-start gap-2 text-left", MOTION_FOCUS)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-medium leading-snug text-foreground">
            {DESK_VERB[deskKey]}
          </span>
          <span className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground">
            {open ? t.does : `${t.does.split(".")[0]}. Tap for what you can do here.`}
          </span>
        </span>
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          {/* 2 — do this */}
          <div className="mt-3">
            <p className="vanta-machine-label text-foreground/70">Do this</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {t.doThis.map((label) => {
                const isRec = label === t.recommended;
                const clickable = !!onDo;
                return (
                  <button
                    key={label}
                    type="button"
                    disabled={!clickable}
                    onClick={() => onDo?.(label)}
                    className={cn(
                      "inline-flex min-h-[36px] items-center gap-1 rounded-[2px] border px-2 text-[11px]",
                      isRec
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border/60 text-foreground/85",
                      clickable ? "hover:border-primary/40" : "cursor-default",
                      MOTION_FOCUS,
                    )}
                  >
                    {label}
                    {isRec && (
                      <span className="rounded-[2px] bg-primary/20 px-1 text-[9px] uppercase tracking-wider text-primary">
                        start
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 — Vanta can help. Each assist opens Ask with the question
              prefilled; Ask drafts, and nothing here commits. */}
          {t.assists.length > 0 && (
            <div className="mt-3">
              <p className="vanta-machine-label text-foreground/70">Vanta can help</p>
              <ul className="mt-1.5 space-y-1.5">
                {t.assists.map((a) => (
                  <li key={a.label}>
                    <button
                      type="button"
                      onClick={() =>
                        void openAskWithContext({
                          kind: "general",
                          id: null,
                          label: DESK_TEACHING[deskKey].does,
                          question: a.label,
                        })
                      }
                      className={cn(
                        "flex w-full items-start gap-2 rounded-[2px] border border-border/50 bg-background/40 p-2 text-left",
                        "hover:border-primary/40",
                        MOTION_FOCUS,
                      )}
                    >
                      <Sparkles className="mt-[2px] h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block text-[11.5px] font-medium leading-snug text-foreground">
                          {a.label}
                        </span>
                        <span className="block text-[11px] leading-snug text-muted-foreground">
                          {a.note}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 4 — what a real record looks like, only while the desk is bare */}
          {!populated && <DeskExample deskKey={deskKey} />}

          {/* 5 — what happens next */}
          <p className="mt-3 border-t border-border/50 pt-2 text-[11px] leading-snug text-muted-foreground">
            <span className="vanta-machine-label mr-1.5 text-foreground/70">Next</span>
            {t.next}
          </p>
        </>
      )}
    </section>
  );
}
