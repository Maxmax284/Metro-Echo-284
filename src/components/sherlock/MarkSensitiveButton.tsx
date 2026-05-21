// MarkSensitiveButton — flips sensitive_flag on every pending Sherlock finding
// tied to a given source object. Also writes a `sherlock_sensitive_file_flagged`
// audit row so the trail records the human's call. Pure UI: parent decides
// where it lives (file card, capture card, note menu).
import { useState } from "react";
import { ShieldAlert, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { vantaSay, vantaToast } from "@/lib/vantaVoice";
import { cn } from "@/lib/utils";

export interface MarkSensitiveButtonProps {
  userId: string;
  sourceObjectType: string;
  sourceObjectId: string;
  /** Current state — controls toggle direction + label. */
  sensitive: boolean;
  onChanged?: (next: boolean) => void;
  size?: "sm" | "default";
  variant?: "ghost" | "outline";
  className?: string;
  /** Render as compact icon-only button. */
  iconOnly?: boolean;
}

export function MarkSensitiveButton({
  userId,
  sourceObjectType,
  sourceObjectId,
  sensitive,
  onChanged,
  size = "sm",
  variant = "ghost",
  className,
  iconOnly = false,
}: MarkSensitiveButtonProps) {
  const [busy, setBusy] = useState(false);
  const next = !sensitive;

  async function toggle() {
    setBusy(true);
    try {
      // Flip flag on every pending finding tied to this source.
      const { error } = await supabase
        .from("sherlock_findings")
        .update({ sensitive_flag: next })
        .eq("user_id", userId)
        .eq("source_object_type", sourceObjectType)
        .eq("source_object_id", sourceObjectId)
        .eq("status", "pending");
      if (error) throw error;

      await supabase.from("audit_log").insert({
        user_id: userId,
        event: next ? "sherlock_sensitive_file_flagged" : "sherlock_sensitive_file_unflagged",
        entity_type: sourceObjectType,
        entity_id: sourceObjectId,
        payload: { manual: true, by: "user" },
      });

      vantaToast.success(next ? vantaSay.sherlock.markedSensitive() : vantaSay.sherlock.unmarkedSensitive());
      onChanged?.(next);
    } catch {
      vantaToast.error(vantaSay.errorWith("Couldn't update sensitivity", "Try again."));
    } finally {
      setBusy(false);
    }
  }

  const Icon = sensitive ? ShieldOff : ShieldAlert;
  const label = sensitive ? "Unmark sensitive" : "Mark sensitive";

  return (
    <Button
      size={size}
      variant={variant}
      disabled={busy}
      onClick={toggle}
      className={cn(
        "text-xs",
        sensitive ? "text-muted-foreground" : "text-amber-600 hover:text-amber-700",
        className,
      )}
      title={label}
    >
      <Icon className={cn("h-3.5 w-3.5", iconOnly ? "" : "mr-1")} />
      {!iconOnly && label}
    </Button>
  );
}
