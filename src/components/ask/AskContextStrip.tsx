// AskContextStrip — the quiet line that says what this thread is bound to.
//
// `Workspace · Project · CampStay`. Nothing decorative: scope comes from the
// authoritative active scope, the object comes from the thread's binding, and
// the object chip travels to the record it names.
import { ArrowUpRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScope } from "@/hooks/useScope";
import { useAskThreads } from "@/providers/AskThreadProvider";
import { useMode, MODE_LABEL } from "@/hooks/useMode";
import { contextHref, contextKindLabel } from "@/lib/askCapabilities";
import { markFlipOriginFromEvent } from "@/lib/flip";
import { MachineLabel } from "@/components/ui/instrument";

export function AskContextStrip({ className }: { className?: string }) {
  const { scope, destination } = useScope();
  const { active, bindContext } = useAskThreads();
  const { mode } = useMode();

  const scopeLabel =
    scope.type === "organization" ? destination : scope.type === "admin" ? "Admin" : "Personal";
  const kindLabel = contextKindLabel(active?.context_kind ?? null);
  const href = contextHref(active?.context_kind ?? null, active?.context_id ?? null);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 overflow-x-auto border-b border-border/40 bg-surface-elevated/25 px-3 py-1.5 text-[11px]",
        className,
      )}
      aria-label="Thread context"
    >
      <MachineLabel className="shrink-0 text-foreground/70">{scopeLabel}</MachineLabel>
      {kindLabel && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span className="shrink-0 text-muted-foreground">{kindLabel}</span>
        </>
      )}
      {active?.context_label && (
        <>
          <span className="text-muted-foreground/50">·</span>
          {href ? (
            <a
              href={href}
              onClick={(e) => markFlipOriginFromEvent(e)}
              className="inline-flex min-w-0 items-center gap-1 rounded-[2px] bg-primary/10 px-1.5 py-0.5 text-primary ring-1 ring-primary/25 hover:bg-primary/15"
              title={`Open ${active.context_label}`}
            >
              <span className="truncate">{active.context_label}</span>
              <ArrowUpRight className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="truncate text-foreground/85">{active.context_label}</span>
          )}
          <button
            type="button"
            onClick={() => active && void bindContext(active.id, null)}
            aria-label="Unbind this thread from its context"
            title="Unbind"
            className="shrink-0 rounded-[2px] p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </>
      )}
      <span className="ml-auto shrink-0 rounded-full bg-surface-elevated/70 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground ring-1 ring-border/50">
        {MODE_LABEL[mode]} · drafts only
      </span>
    </div>
  );
}
