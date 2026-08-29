// CrossDeviceResume — one companion, followed across bodies.
//
// Doctrine: this is a pointer back to work, never a carried approval. It appears
// once, quietly, only when the last activity came from a different device inside
// the useful window and belongs to the scope you are in right now. Dismissing it
// is final for that hand-off.
import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVantaContext } from "@/providers/VantaContextProvider";
import { useScope } from "@/hooks/useScope";
import { detectDeviceClass } from "@/lib/deviceClass";
import { APPROVAL_NEVER_CARRIES, resumeNotice, type ResumeNotice } from "@/lib/handoffResume";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { MachineLabel } from "@/components/ui/instrument";
import type { SurfaceKey } from "@/components/shell/SurfaceTabs";

const DISMISS_KEY = "vanta.resume.dismissed";

export function CrossDeviceResume({ onNavigate }: { onNavigate: (k: SurfaceKey) => void }) {
  const { arrival, context } = useVantaContext();
  const { key } = useScope();
  const [notice, setNotice] = useState<ResumeNotice | null>(null);

  useEffect(() => {
    if (!arrival) {
      setNotice(null);
      return;
    }
    const n = resumeNotice({
      stored: arrival,
      scopeKey: key,
      deviceClass: detectDeviceClass(),
      quietHours: context.quietHours,
    });
    if (!n) {
      setNotice(null);
      return;
    }
    /* One hand-off, one chance to be useful. */
    if (window.localStorage.getItem(DISMISS_KEY) === n.key) {
      setNotice(null);
      return;
    }
    setNotice(n);
  }, [arrival, key, context.quietHours]);

  if (!notice) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, notice.key);
    setNotice(null);
  };

  const resume = () => {
    dismiss();
    if (notice.projectId) {
      window.location.href = `/projects/${notice.projectId}`;
      return;
    }
    onNavigate(notice.surface as SurfaceKey);
  };

  return (
    <section className="vanta-card p-3" aria-label="Continue across devices">
      <div className="flex items-center gap-2">
        <Smartphone className="h-3.5 w-3.5 text-primary" aria-hidden />
        <MachineLabel className="text-foreground/70">Picking up</MachineLabel>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-foreground">{notice.line}</p>
      {notice.step && <p className="mt-0.5 text-[11px] text-muted-foreground">{notice.step}</p>}
      {notice.pendingActionId && (
        <p className="mt-1 text-[11px] leading-snug text-amber-400">{APPROVAL_NEVER_CARRIES}</p>
      )}
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="h-8 flex-1 text-xs" onClick={resume}>
          Resume
        </Button>
        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={dismiss}>
          Dismiss
        </Button>
      </div>
      <AftermathHint text="Resume just opens where you were. Nothing was approved while you moved." />
    </section>
  );
}
