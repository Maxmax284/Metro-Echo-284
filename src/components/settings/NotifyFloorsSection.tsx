import { SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  CATEGORY_DETAIL,
  CATEGORY_LABEL,
  FLOOR_DETAIL,
  FLOOR_LABEL,
  NOTIFY_CATEGORIES,
  NOTIFY_FLOORS,
  readFloors,
  type NotifyCategory,
  type NotifyFloor,
} from "@/lib/notifyPolicy";
import { cn } from "@/lib/utils";

/**
 * Per-category floors — the one place you decide what may interrupt you.
 * Every change is audited; the sweeps read the same ladder.
 */
export function NotifyFloorsSection() {
  const { user } = useAuth();
  const { prefs, update } = useUserPreferences();
  const floors = readFloors(prefs as Record<string, unknown>);

  const setFloor = async (category: NotifyCategory, floor: NotifyFloor) => {
    if (!user || floors[category] === floor) return;
    const next = { ...floors, [category]: floor };
    await update({ notify_floors: next });
    await supabase.from("audit_log").insert({
      user_id: user.id,
      entity_type: "profile",
      entity_id: user.id,
      event: "preferences.updated",
      payload: { field: "notify_floors", category, value: floor },
    });
  };

  return (
    <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
      <div className="flex items-start gap-2">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What may interrupt you</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Per category: buzz your phone, wait quietly in Today, or gather into the digest.
            Critical safety news always punches through, whatever you pick here.
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {NOTIFY_CATEGORIES.map((cat) => (
          <li key={cat} className="rounded-lg bg-background/30 p-2.5 ring-1 ring-border/40">
            <div className="text-[12.5px] font-medium text-foreground/90">{CATEGORY_LABEL[cat]}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{CATEGORY_DETAIL[cat]}</div>
            <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label={`${CATEGORY_LABEL[cat]} floor`}>
              {NOTIFY_FLOORS.map((f) => {
                const active = floors[cat] === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFloor(cat, f)}
                    aria-pressed={active}
                    title={FLOOR_DETAIL[f]}
                    className={cn(
                      "min-h-[44px] rounded-md px-2 py-1.5 text-[11.5px] ring-1 transition-colors",
                      active
                        ? "bg-primary/15 font-medium text-primary ring-primary/40"
                        : "bg-background/40 text-muted-foreground ring-border/60 hover:bg-surface-elevated hover:text-foreground",
                    )}
                  >
                    {FLOOR_LABEL[f]}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
