// FirstRunWalkthrough — full-screen mobile-first overlay. 384px target.
// Skip / Back / Next / dots. No auto-advance. Replayable from Settings.
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTutorial } from "./TutorialProvider";
import { WALKTHROUGH_SLIDES } from "./tutorialCopy";
import { cn } from "@/lib/utils";

export function FirstRunWalkthrough() {
  const { open, step, setStep, closeTutorial } = useTutorial();
  const total = WALKTHROUGH_SLIDES.length;
  const slide = WALKTHROUGH_SLIDES[Math.min(step, total - 1)];
  const isLast = step >= total - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) closeTutorial(false); }}>
      <DialogContent
        className="max-w-md gap-0 p-0 sm:max-w-md"
        aria-describedby="tutorial-body"
      >
        <div className="relative flex flex-col">
          <button
            onClick={() => closeTutorial(false)}
            aria-label="Skip tutorial"
            className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>

          <div className="space-y-3 px-5 pb-3 pt-6 sm:px-6">
            <Badge variant="secondary" className="text-[10.5px] uppercase tracking-wider">
              {slide.pill}
            </Badge>
            <h2 className="text-[18px] font-semibold leading-tight text-foreground">
              {slide.title}
            </h2>
            <p id="tutorial-body" className="text-[13.5px] leading-relaxed text-foreground/85">
              {slide.body}
            </p>
          </div>

          {/* Dots */}
          <div className="flex items-center justify-center gap-1.5 px-5 py-2">
            {WALKTHROUGH_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between gap-2 border-t border-border/40 bg-surface-elevated/40 px-4 py-3">
            <Button
              size="sm" variant="ghost"
              className="h-8 gap-1 text-[12px]"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Back
            </Button>
            {!isLast ? (
              <Button
                size="sm"
                className="h-8 gap-1 text-[12px]"
                onClick={() => setStep(Math.min(total - 1, step + 1))}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-8 text-[12px]"
                onClick={() => closeTutorial(true)}
              >
                Got it
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
