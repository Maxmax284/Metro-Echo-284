// FirstLapCard — one guided lap, on your own content.
//
// Doctrine: no carousel and no invented sample. The lap follows a real item:
// capture it, route it, see where it landed, read the receipt, and see how it
// can come back on Today. Steps one and two are read from real records — the
// card cannot claim you did something you did not do. The two reading steps
// complete when you actually open the room.
//
// It reads only. Nothing here executes, and it disappears once the lap is done
// or you dismiss it.
import { useCallback, useEffect, useState } from "react";
import { Check, Circle, Flag, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useScope } from "@/hooks/useScope";
import { GotSomethingChooser } from "@/components/intake/GotSomethingChooser";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { cn } from "@/lib/utils";
import { MOTION_FOCUS } from "@/lib/motion";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

const SEEN_KEY = "vanta.firstLap.seen";
const DISMISS_KEY = "vanta.firstLap.dismissed";

type SeenStep = "landed" | "receipt" | "today";

function readSeen(): SeenStep[] {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? (JSON.parse(raw) as SeenStep[]) : [];
  } catch {
    return [];
  }
}

export function FirstLapCard({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { user } = useAuth();
  const { applyScope, key: scopeKey } = useScope();
  const [captured, setCaptured] = useState(false);
  const [routed, setRouted] = useState(false);
  const [seen, setSeen] = useState<SeenStep[]>(() => readSeen());
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    const [notes, routes] = await Promise.all([
      applyScope(supabase.from("notes").select("id", { count: "exact", head: true })),
      applyScope(supabase.from("capture_routes").select("id", { count: "exact", head: true })),
    ]);
    setCaptured((((notes as unknown) as { count?: number })?.count ?? 0) > 0);
    setRouted((((routes as unknown) as { count?: number })?.count ?? 0) > 0);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, scopeKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function markSeen(step: SeenStep) {
    setSeen((prev) => {
      if (prev.includes(step)) return prev;
      const next = [...prev, step];
      try {
        localStorage.setItem(SEEN_KEY, JSON.stringify(next));
      } catch {
        /* a lost tick is not worth an error */
      }
      return next;
    });
  }

  const steps = [
    {
      key: "capture",
      done: captured,
      title: "Capture something real",
      line: "Anything you actually need to remember. One line is enough.",
      control: <GotSomethingChooser onFiled={() => void refresh()} />,
    },
    {
      key: "route",
      done: routed,
      title: "Route it",
      line: "Open Inbox and send it to a project, a promise, or keep it as a note.",
      control: <LapButton label="Open Inbox" onClick={() => onNavigate("inbox")} />,
    },
    {
      key: "landed",
      done: seen.includes("landed"),
      title: "See where it landed",
      line: "Every object has one home. Open the desk that now holds it.",
      control: (
        <LapButton
          label="Open Work"
          onClick={() => {
            markSeen("landed");
            onNavigate("work");
          }}
        />
      ),
    },
    {
      key: "receipt",
      done: seen.includes("receipt"),
      title: "Read the receipt",
      line: "Receipts keeps the trail: what changed, when, and where it came from.",
      control: (
        <LapButton
          label="Open Receipts"
          onClick={() => {
            markSeen("receipt");
            onNavigate("audit");
          }}
        />
      ),
    },
    {
      key: "today",
      done: seen.includes("today"),
      title: "See how it comes back",
      line: "Dated promises and waiting drafts surface here on Today when they matter.",
      control: <LapButton label="Got it" onClick={() => markSeen("today")} />,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  if (dismissed || !loaded || doneCount === steps.length) return null;

  return (
    <section className="vanta-card p-3" aria-label="Your first lap">
      <div className="flex items-start gap-2">
        <Flag className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-medium text-foreground">
            One lap with your own content ({doneCount} of {steps.length})
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Follow one real item all the way through. No sample data, nothing to undo.
          </p>
        </div>
        <button
          type="button"
          aria-label="Hide the first lap"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* ignore */
            }
          }}
          className={cn("shrink-0 rounded-[2px] p-1 text-muted-foreground/80 hover:text-foreground", MOTION_FOCUS)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ol className="mt-2.5 space-y-2">
        {steps.map((s, i) => (
          <li key={s.key} className="flex items-start gap-2">
            {s.done ? (
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-label="Done" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[11.5px] font-medium",
                  s.done ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {i + 1}. {s.title}
              </p>
              {!s.done && (
                <>
                  <p className="text-[10.5px] leading-snug text-muted-foreground">{s.line}</p>
                  <div className="mt-1">{s.control}</div>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>

      <AftermathHint text="Nothing here is a demo · the item you use is a real record you can read or delete" />
    </section>
  );
}

function LapButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[32px] items-center rounded-[2px] border border-border/60 px-2",
        "text-[10.5px] text-foreground/85 hover:border-primary/40 hover:text-foreground",
        MOTION_FOCUS,
      )}
    >
      {label}
    </button>
  );
}
