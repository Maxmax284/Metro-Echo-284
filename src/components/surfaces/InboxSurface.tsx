import { useState } from "react";
import { SurfaceAftermath } from "@/components/aftermath/SurfaceAftermath";
import { Inbox as InboxIcon } from "lucide-react";
import { CapturesView } from "@/components/memory/CapturesView";
import { MemoryFilesView } from "@/components/memory/MemoryFilesView";
import { InboxNotesList } from "@/components/inbox/InboxNotesList";
import { cn } from "@/lib/utils";

type Tab = "captures" | "notes" | "files";

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: "captures", label: "Captures", hint: "Telegram, email, voice, screenshots" },
  { id: "notes", label: "Notes", hint: "Things you typed in" },
  { id: "files", label: "Files", hint: "Uploads and attachments" },
];

/**
 * InboxSurface — one home for everything that lands in Vanta before it's
 * organized. Sub-tabs reuse existing views; per-tab multi-select + bulk
 * “Push to project” pushes items into a Living Brief.
 */
export function InboxSurface() {
  const [tab, setTab] = useState<Tab>("captures");
  const active = TABS.find((t) => t.id === tab)!;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:py-7">
      <header className="mb-4">
        <div className="flex items-center gap-2">
          <InboxIcon className="h-4 w-4 text-primary" />
          <h1 className="text-lg font-semibold">Inbox</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Stuff lands here first. Pick what belongs together and push it into a project.
        </p>
      </header>

      <div
        role="tablist"
        aria-label="Inbox sections"
        className="mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-border/60 bg-surface-elevated p-1"
      >
        {TABS.map((t) => {
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          );
        })}
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">
          {active.hint}
        </span>
      </div>

      <div className="min-h-[200px]">
        {tab === "captures" && <CapturesView />}
        {tab === "notes" && <InboxNotesList />}
        {tab === "files" && <MemoryFilesView />}
      </div>

      <SurfaceAftermath surface="inbox" />
    </div>
  );
}
