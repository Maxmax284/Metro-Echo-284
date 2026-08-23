// AskAboutButton — the one control that hands a record to Ask.
//
// Doctrine: a surface never invents thread state and never sends a message for
// the user. It says "this is what I'm looking at" and prefills an opening
// question. Ask reads and drafts; nothing executes from here.
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAskContext } from "@/hooks/useAskContext";
import type { ThreadContextKind } from "@/lib/askThreads";
import { cn } from "@/lib/utils";

export function AskAboutButton({
  kind,
  id,
  label,
  question,
  text = "Ask about this",
  expand = false,
  className,
  size = "sm",
}: {
  kind: ThreadContextKind;
  id?: string | null;
  label: string;
  /** Prefilled opening question. Never sent automatically. */
  question?: string;
  text?: string;
  expand?: boolean;
  className?: string;
  size?: "sm" | "icon";
}) {
  const { openAskWithContext } = useAskContext();
  const go = () => void openAskWithContext({ kind, id: id ?? null, label, question, expand });

  if (size === "icon") {
    return (
      <button
        type="button"
        onClick={go}
        aria-label={`Ask about ${label}`}
        title={`Ask about ${label}`}
        className={cn(
          "shrink-0 rounded-[2px] px-1.5 py-1 text-muted-foreground hover:text-primary",
          className,
        )}
      >
        <MessageSquare className="h-3.5 w-3.5" />
      </button>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className={cn("h-7 gap-1 px-2 text-xs", className)}
      onClick={go}
    >
      <MessageSquare className="h-3 w-3" /> {text}
    </Button>
  );
}
