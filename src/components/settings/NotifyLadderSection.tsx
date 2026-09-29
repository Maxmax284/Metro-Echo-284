import { Bell, BellOff, MoonStar, Inbox, Layers } from "lucide-react";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  CATEGORY_LABEL,
  NOTIFY_CATEGORIES,
  readFloors,
} from "@/lib/notifyPolicy";
import { cn } from "@/lib/utils";

/**
 * The ladder — one glance that answers "what reaches me, and when".
 * Every rung is derived from your real settings, never marketing copy.
 */
export function NotifyLadderSection() {
  const { prefs, loading } = useUserPreferences();
  const floors = readFloors(prefs as Record<string, unknown>);

  const buzzCats = NOTIFY_CATEGORIES.filter((c) => floors[c] === "buzz");
  const todayCats = NOTIFY_CATEGORIES.filter((c) => floors[c] === "today");
  const digestCats = NOTIFY_CATEGORIES.filter((c) => floors[c] === "digest");

  const quiet = `${prefs.quiet_hours_start}–${prefs.quiet_hours_end}`;
  const names = (cats: typeof NOTIFY_CATEGORIES[number][]) =>
    cats.map((c) => CATEGORY_LABEL[c]).join(", ");

  const rungs = [
    {
      icon: Bell,
      tone: "text-destructive",
      title: "Punches through, even in quiet hours",
      body: "Critical only — a genuine safety hazard or an urgent flight change. Nothing else gets this lane.",
    },
    {
      icon: Bell,
      tone: "text-primary",
      title: `Buzzes you outside quiet hours (${quiet})`,
      body: buzzCats.length
        ? `${names(buzzCats)}.${prefs.push_reminders_enabled ? "" : " Push is off below — until it's on, these wait in Today too."}`
        : "Nothing lands here right now. Move a category to Buzz me below.",
    },
    {
      icon: Inbox,
      tone: "text-muted-foreground",
      title: "Waits for you in Today",
      body: todayCats.length
        ? `${names(todayCats)} — plus everything merely informational. Open Today and it's there, no buzz.`
        : "Everything merely informational. Open Today and it's there, no buzz.",
    },
    {
      icon: Layers,
      tone: "text-muted-foreground",
      title: "Gathered quietly",
      body: digestCats.length
        ? `${names(digestCats)}. The weekly digest carries it; Receipts always has the record.`
        : "Nothing lands here right now.",
    },
  ];

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <MoonStar className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">The ladder</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            What reaches you, in order of how loudly. This reads your live settings — change a floor below and the
            ladder moves.
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-[12px] text-muted-foreground">Reading your settings…</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {rungs.map((r, i) => {
            const Icon = i === 0 ? BellOff : r.icon;
            return (
              <li
                key={r.title}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg bg-background/30 px-3 py-2 ring-1 ring-border/40",
                  i === 0 && "ring-destructive/20",
                )}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-background/60 ring-1 ring-border/50 text-[10px] font-semibold text-muted-foreground">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium text-foreground/90">{r.title}</div>
                  <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{r.body}</div>
                </div>
                <Icon className={cn("ml-auto mt-1 h-3.5 w-3.5 shrink-0", r.tone)} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
