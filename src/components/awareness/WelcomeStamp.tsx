// WelcomeStamp — the deliberate act that marks a place as yours.
//
// One press writes one row (stamped_at on the place) and one receipt
// (place.stamped in the audit trail). The stamp shows pressed on the board
// and echoes at boot while this is where you stand. Lifting it is always
// one tap and leaves its own receipt — rollback is real, so undo is offered
// as a standing action, not a disappearing toast trick.
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { vantaToast as toast } from "@/lib/vantaVoice";
import { play } from "@/lib/streetSound";
import { reducedMotion } from "@/lib/reducedMotion";
import { STAMP_COPY, stampSpoken, stampWord } from "@/lib/welcomeStamp";
import type { AwarenessPlace } from "@/providers/AwarenessProvider";

export function WelcomeStamp({
  place,
  onChanged,
}: {
  place: AwarenessPlace | null;
  onChanged: (id: string, stampedAt: string | null) => void;
}) {
  const { session } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [justPressed, setJustPressed] = useState(false);

  if (!place) return null;
  const stampedAt = typeof place.stamped_at === "string" ? place.stamped_at : null;

  const write = async (at: string | null) => {
    if (!session || busy) return;
    setBusy(true);
    const { error } = await supabase
      .from("awareness_places")
      .update({ stamped_at: at })
      .eq("id", place.id);
    if (error) {
      setBusy(false);
      toast.fromError(error, "The stamp didn't take. Try again.");
      return;
    }
    /* The receipt: every state change keeps one, even a keepsake. */
    await supabase.from("audit_log").insert({
      user_id: session.user.id,
      entity_type: "place",
      entity_id: place.id,
      event: at ? "place.stamped" : "place.stamp_lifted",
      payload: { label: place.label, stamped_at: at },
    });
    setBusy(false);
    setConfirming(false);
    if (at) {
      if (!reducedMotion()) play("stamp", { gain: 0.4 });
      setJustPressed(true);
      toast.success(STAMP_COPY.pressed);
    } else {
      toast.success(STAMP_COPY.lifted);
    }
    onChanged(place.id, at);
  };

  if (stampedAt) {
    const word = stampWord(stampedAt);
    const spoken = stampSpoken(stampedAt);
    return (
      <div className="vanta-card flex items-center gap-3 rounded-xl px-3 py-2.5">
        <span
          className={cn("place-stamp", justPressed && "place-stamp-in")}
          aria-label={spoken ? `Stamped ${spoken}` : "Stamped"}
        >
          Stamped {word ?? ""}
        </span>
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
          {spoken ? `Your ground since ${spoken}. Echo answers from here.` : STAMP_COPY.why}
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 text-[11px]"
          disabled={busy}
          onClick={() => void write(null)}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : STAMP_COPY.lift}
        </Button>
      </div>
    );
  }

  return (
    <div className="vanta-card rounded-xl px-3 py-2.5">
      {confirming ? (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-[12px] leading-snug">{STAMP_COPY.confirm}</p>
          <Button
            size="sm"
            className="h-8 shrink-0"
            disabled={busy}
            onClick={() => void write(new Date().toISOString())}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : STAMP_COPY.press}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            disabled={busy}
            onClick={() => setConfirming(false)}
          >
            {STAMP_COPY.cancel}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" className="h-8 shrink-0" onClick={() => setConfirming(true)}>
            {STAMP_COPY.action}
          </Button>
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">{STAMP_COPY.why}</p>
        </div>
      )}
    </div>
  );
}
