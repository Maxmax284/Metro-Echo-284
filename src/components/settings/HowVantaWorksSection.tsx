import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "@/components/tutorial/TutorialProvider";
import { SystemMap } from "@/components/tutorial/SystemMap";
import { FollowOneNoteDemo } from "@/components/tutorial/FollowOneNoteDemo";

/** The whole flow in plain English, replayable any time. */
export function HowVantaWorksSection() {
  const { startTutorial } = useTutorial();
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <>
      <section className="mb-6 rounded-xl surface-elevated p-4 ring-1 ring-border/60">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">How Vanta Works</h2>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              The whole flow in plain English. Replay the first-run walkthrough any time.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2">
            <Button size="sm" variant="outline" className="h-8 text-[11.5px]" onClick={startTutorial}>
              Replay tutorial
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-[11.5px]" onClick={() => setDemoOpen(true)}>
              Follow one note
            </Button>
          </div>
        </div>
        <div className="mt-3">
          <SystemMap />
        </div>
      </section>

      <FollowOneNoteDemo open={demoOpen} onOpenChange={setDemoOpen} />
    </>
  );
}
