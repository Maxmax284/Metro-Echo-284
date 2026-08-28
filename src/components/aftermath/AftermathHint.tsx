// AftermathHint — the one-line version of the aftermath contract.
//
// Use this where a card already carries its own buttons and a full
// `AftermathFooter` (with its own "Next:" affordance) would duplicate them.
// It answers one question and nothing else: what happens if I tap.
//
// Doctrine: this line never executes, never fetches, never invents state. It
// is copy, derived from a doctrine tap kind or handed in verbatim by a surface
// that already knows where the record lands.
import { cn } from "@/lib/utils";
import { voice, type TapKind } from "@/lib/vantaVoice";

export function AftermathHint({
  /** Pick a doctrine tap kind, or pass `text` for a specific destination line. */
  tapKind,
  /** Overrides the tap kind. Shape: "Filed to Lamai rollout · appears in Receipts". */
  text,
  /** Drops the top divider when the parent already draws one. */
  bare,
  className,
}: {
  tapKind?: TapKind;
  text?: string;
  bare?: boolean;
  className?: string;
}) {
  const line = text ?? voice.tapHint(tapKind ?? "review");
  if (!line) return null;
  return (
    <p
      className={cn(
        "text-[10px] italic leading-snug text-muted-foreground/70",
        !bare && "mt-2 border-t border-border/40 pt-1.5",
        className,
      )}
    >
      {line}
    </p>
  );
}
