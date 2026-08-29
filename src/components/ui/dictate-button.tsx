// DictateButton — speak into any text field.
//
// It appends what it hears to the value it was given and hands it back. It
// never submits, never calls a model, and never rewrites what you already
// typed. When the browser has no speech engine, it renders nothing.
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDictation } from "@/hooks/useDictation";

export function DictateButton({
  value,
  onChange,
  label = "Dictate",
  disabled,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  const { supported, listening, interim, error, toggle } = useDictation({
    onFinal: (phrase) => onChange(value ? `${value.trimEnd()} ${phrase}` : phrase),
  });

  if (!supported) return null;

  return (
    <div className={cn("space-y-1", className)}>
      <Button
        type="button"
        size="sm"
        variant={listening ? "default" : "outline"}
        className="h-8 min-h-[36px] gap-1.5 text-xs"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={listening}
        aria-label={listening ? "Stop dictating" : label}
      >
        {listening ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        {listening ? "Stop" : label}
      </Button>
      {listening ? (
        <p className="text-[10.5px] italic text-muted-foreground">
          {interim ? interim : "Listening — speak the change, then tap Stop."}
        </p>
      ) : null}
      {error ? <p className="text-[10.5px] text-destructive">{error}</p> : null}
    </div>
  );
}
