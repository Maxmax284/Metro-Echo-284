// SherlockEvidenceDrawer — the items behind a finding, by desk.
//
// Doctrine: read-only. Every row opens the real desk for that item. Empty
// categories teach what would land there. Nothing in here executes, accepts
// or files anything.
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LoadingState } from "@/components/ui/state-views";
import { AftermathHint } from "@/components/aftermath/AftermathHint";
import { WhyThisTriggered } from "./WhyThisTriggered";
import { useFindingEvidence, type EvidenceCategory } from "@/hooks/useFindingEvidence";
import type { SherlockFinding } from "@/lib/sherlock/types";
import { Notebook, ListChecks, CalendarClock, Inbox, FileText, Link2, ChevronRight } from "lucide-react";

const SECTIONS: Array<{
  key: EvidenceCategory;
  label: string;
  Icon: typeof Notebook;
  /** What would land here, said plainly, when the section is empty. */
  empty: string;
}> = [
  { key: "notes", label: "Notes", Icon: Notebook, empty: "No note is part of this. Notes appear here when a finding reads one." },
  { key: "actions", label: "Promises and actions", Icon: ListChecks, empty: "No promise or draft action is involved yet." },
  { key: "calendar", label: "Calendar", Icon: CalendarClock, empty: "No meeting is involved. Calendars are read-only here." },
  { key: "inbox", label: "Inbox", Icon: Inbox, empty: "No capture or file is behind this one." },
  { key: "documents", label: "Documents", Icon: FileText, empty: "No document is involved." },
  { key: "linked", label: "Also linked", Icon: Link2, empty: "Nothing else is linked to this yet." },
];

export function SherlockEvidenceDrawer({
  finding,
  open,
  onOpenChange,
  onNavigate,
}: {
  finding: SherlockFinding | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate?: (surface: string) => void;
}) {
  const { items } = useFindingEvidence(finding, open);

  const go = (surface?: string | null, href?: string | null) => {
    if (href) { window.location.href = href; return; }
    if (surface && onNavigate) { onOpenChange(false); onNavigate(surface); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-6 text-left text-[15px] leading-snug">
            {finding?.summary ?? "Finding"}
          </SheetTitle>
        </SheetHeader>

        {finding && (
          <>
            <WhyThisTriggered finding={finding} />

            {items === null ? (
              <div className="mt-3">
                <LoadingState label="Pulling the items behind this…" />
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {SECTIONS.map((s) => {
                  const rows = items.filter((i) => i.category === s.key);
                  const Icon = s.Icon;
                  return (
                    <section key={s.key}>
                      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Icon className="h-3 w-3" aria-hidden /> {s.label}
                        {rows.length > 0 && <span className="text-foreground/70">· {rows.length}</span>}
                      </p>
                      {rows.length === 0 ? (
                        <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/70">{s.empty}</p>
                      ) : (
                        <ul className="mt-1 space-y-1">
                          {rows.map((r) => (
                            <li key={`${r.category}:${r.id}`}>
                              <button
                                type="button"
                                onClick={() => go(r.surface, r.href)}
                                className="flex w-full items-center gap-2 rounded-md border border-border/60 bg-surface-elevated/40 p-2 text-left transition hover:border-primary/40"
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[12px] font-medium text-foreground">{r.title}</span>
                                  <span className="block text-[10px] text-muted-foreground">
                                    {r.kindLabel}{r.detail ? ` · ${r.detail}` : ""}
                                  </span>
                                </span>
                                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            )}

            <AftermathHint text="Opening an item takes you to its desk · nothing here files or runs anything" />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
