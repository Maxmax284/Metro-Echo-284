// FeedbackBar — surface-agnostic, lightweight correction controls.
// Writes directly to `corrections` / `field_notes`. No surveys, no stars.
// Wherever a card represents something Vanta inferred (signal, finding,
// memory, classification), drop this in the footer.

import { useContext, useState } from "react";
import { toast } from "sonner";
import { Check, AlertTriangle, Clock, MapPin, EyeOff, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { geohashFromGeo } from "@/lib/geohash";

type Surface =
  | "awareness" | "memory" | "sherlock" | "intake" | "companion"
  | "actions" | "commitments" | "audit" | "telegram" | "research" | "other";

type FeedbackType =
  | "wrong" | "correct" | "outdated" | "useful" | "not_useful"
  | "source_bad" | "reject";

type Props = {
  surface: Surface;
  targetType: string;          // e.g. "sherlock_finding", "signal:transport"
  targetId: string;            // uuid string OR a stable text key
  /** What this card is about — used as default field-note label. */
  label?: string;
  /** Optional snapshot of the original payload, kept side-by-side. */
  original?: unknown;
  className?: string;
  /** Hide the field-note button (e.g. on already-saved field notes). */
  hideFieldNote?: boolean;
};

const ACTIONS: Array<{
  key: FeedbackType | "add_field_note";
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  toast: string;
  impact: "lower" | "raise" | "invalidate" | "none";
  tone: string;
}> = [
  { key: "useful",         label: "Useful",   Icon: Check,          toast: "Marked useful.",   impact: "raise",      tone: "hover:text-primary" },
  { key: "wrong",          label: "Wrong",    Icon: AlertTriangle,  toast: "Marked wrong.",    impact: "invalidate", tone: "hover:text-danger" },
  { key: "outdated",       label: "Outdated", Icon: Clock,          toast: "Marked outdated.", impact: "lower",      tone: "hover:text-warn" },
  { key: "source_bad",     label: "Source",   Icon: Flag,           toast: "Source flagged.",  impact: "lower",      tone: "hover:text-warn" },
  { key: "reject",         label: "Hide",     Icon: EyeOff,         toast: "Won't show again.",impact: "invalidate", tone: "hover:text-muted-foreground" },
  { key: "add_field_note", label: "Note",     Icon: MapPin,         toast: "Field note saved.",impact: "none",       tone: "hover:text-accent" },
];

export function FeedbackBar({
  surface,
  targetType,
  targetId,
  label,
  original,
  className,
  hideFieldNote,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const send = async (key: FeedbackType | "add_field_note") => {
    if (busy) return;
    setBusy(key);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Not signed in."); return; }

      if (key === "add_field_note") {
        const summary = typeof window !== "undefined"
          ? window.prompt(label ? `Field note about "${label}":` : "Field note:", "")
          : null;
        if (!summary || !summary.trim()) return;
        const { data: inserted, error } = await supabase.from("field_notes").insert({
          user_id: u.user.id,
          note_type: "custom",
          summary: summary.trim(),
          location_label: label ?? null,
        }).select("id").single();
        if (error) throw error;
        // Stage 10 — audit hardening.
        await supabase.from("audit_log").insert({
          user_id: u.user.id,
          entity_type: "field_note",
          entity_id: inserted?.id ?? null,
          event: "field_note:created",
          payload: { surface, target_type: targetType, target_id: targetId, summary: summary.trim() } as any,
        });
        toast.success("Field note saved.");
      } else {
        const cfg = ACTIONS.find((a) => a.key === key)!;
        const { data: inserted, error } = await supabase.from("corrections").insert({
          user_id: u.user.id,
          surface,
          target_type: targetType,
          target_id: targetId,
          feedback_type: key,
          original_value: original ? { value: original } as any : null,
          confidence_impact: cfg.impact,
        }).select("id").single();
        if (error) throw error;
        await supabase.from("audit_log").insert({
          user_id: u.user.id,
          entity_type: "correction",
          entity_id: inserted?.id ?? null,
          event: `correction:${key}`,
          payload: { surface, target_type: targetType, target_id: targetId } as any,
        });
        toast.success(cfg.toast);
      }
      setDone((d) => new Set(d).add(key));
    } catch (e: any) {
      toast.error("Couldn't save", { description: e?.message ?? "Try again." });
    } finally {
      setBusy(null);
    }
  };

  // Stage 9 polish — once any verb succeeds, collapse the row into a calm
  // confirmation. No surveys, no celebration, no nudge to do more.
  if (done.size > 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-[10px] text-muted-foreground/80 animate-in fade-in duration-300",
          className,
        )}
      >
        <Check className="h-2.5 w-2.5 text-primary/80" />
        <span>Thanks — saved.</span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground/70",
        "opacity-60 transition-opacity hover:opacity-100 focus-within:opacity-100",
        className,
      )}
    >
      {ACTIONS.filter((a) => !(hideFieldNote && a.key === "add_field_note")).map((a) => {
        const isBusy = busy === a.key;
        return (
          <button
            key={a.key}
            type="button"
            onClick={() => send(a.key)}
            disabled={isBusy}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 ring-1 ring-border/40 transition-colors",
              "hover:bg-muted/30 hover:ring-border/70",
              "disabled:opacity-50",
              a.tone,
            )}
            title={a.label}
          >
            <a.Icon className="h-2.5 w-2.5" />
            <span>{a.label}</span>
          </button>
        );
      })}
    </div>
  );
}
