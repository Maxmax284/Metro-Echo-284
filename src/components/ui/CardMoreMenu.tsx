import { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * CardMoreMenu — the "•••" slot on a card.
 *
 * Doctrine: every card answers what is this / what happened / what can I do.
 * That means one primary action visible, one secondary if essential, and
 * every other action tucked behind this menu. Keeps cards calm.
 *
 * Children render inside the popover — pass DropdownMenuItem nodes, or any
 * arbitrary content for richer trays (Attach sheet trigger, etc.).
 */
export function CardMoreMenu({
  children,
  label = "More",
  className,
  align = "end",
}: {
  children: ReactNode;
  label?: string;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7 text-muted-foreground hover:text-foreground", className)}
          aria-label={label}
          title={label}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
