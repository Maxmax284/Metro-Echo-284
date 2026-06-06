// WhatIsThis — small (?) chip with a popover. Drop next to any card header.
// Reads copy from tutorialCopy.WHAT_IS_THIS by key.
import { HelpCircle } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { WHAT_IS_THIS } from "./tutorialCopy";
import { cn } from "@/lib/utils";

export function WhatIsThis({
  topic,
  className,
  label = "What is this?",
}: {
  topic: keyof typeof WHAT_IS_THIS;
  className?: string;
  label?: string;
}) {
  const text = WHAT_IS_THIS[topic];
  if (!text) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground",
            className,
          )}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 p-3 text-[12.5px] leading-relaxed">
        <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <p className="text-foreground/90">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
